// D2L Brightspace reader. Runs as a content script on the school's D2L host,
// so every fetch below is same-origin and rides the student's own session
// cookie: Timetify never sees their school password.
//
// Read-only. It touches enrollments, the content tree, announcements, dropbox
// folders, quizzes and the course calendar, and downloads only the outline
// files the student ticks. No grades,
// classlists or messages.
//
// Kept free of extension APIs so it can be pasted into a D2L tab's console
// and exercised on its own (see extension/README.md).

(() => {
  // "ST230_Outline_F2026_Draft", "CP363-B_Syllabus -Database-I_F26",
  // "Fall 2026 MA123 syllabus", a module titled "Course Oultine" (sic).
  const OUTLINE = /\b(course\s*)?(outline|oultine|syllabus|syllabi)\b|\b(unit|course)\s+guide\b|\bcourse\s+info(rmation)?\b/i;
  const NOT_OUTLINE = /\b(practice|grading|contact|office\s+hours|slides?|notes?|solutions?|lecture|tutorial)\b/i;
  const SUPPORTED = new Set(["pdf", "docx"]);
  const MAX_BYTES = 5 * 1024 * 1024; // matches the backend's upload cap

  const tidy = (s) => String(s || "").replace(/[_-]+/g, " ");
  const extOf = (name) => ((String(name || "").split("?")[0].match(/\.([a-z0-9]+)$/i) || [])[1] || "").toLowerCase();

  // D2L stores an 11:59pm Toronto deadline as 03:59Z the next day. The
  // student's local calendar date is what they mean, so convert here, where
  // the browser knows the zone, and send dates only.
  const localDate = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  };

  async function get(path) {
    const r = await fetch(path, { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`${path.split("?")[0]} → ${r.status}`);
    return r.json();
  }

  async function versions() {
    const all = await get("/d2l/api/versions/");
    const pick = (code) => (all.find((x) => x.ProductCode === code) || {}).LatestVersion;
    const v = { lp: pick("lp"), le: pick("le") };
    if (!v.lp || !v.le) throw new Error("this d2l doesn't expose the api versions we need");
    return v;
  }

  // Course offerings whose access window covers today (or starts within three
  // weeks, so a sync just before term works). Orientation shells and advising
  // pages have no window and drop out here.
  async function currentCourses(v, now = Date.now()) {
    const items = [];
    let bookmark = "";
    do {
      const q = bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : "";
      const page = await get(`/d2l/api/lp/${v.lp}/enrollments/myenrollments/?orgUnitTypeId=3${q}`);
      items.push(...(page.Items || []));
      bookmark = page.PagingInfo && page.PagingInfo.HasMoreItems ? page.PagingInfo.Bookmark : "";
    } while (bookmark);

    const soon = 21 * 864e5;
    return items
      .filter((i) => i.Access && i.Access.CanAccess && i.Access.StartDate && i.Access.EndDate
        && Date.parse(i.Access.StartDate) <= now + soon && now <= Date.parse(i.Access.EndDate))
      .map((i) => ({
        id: String(i.OrgUnit.Id),
        code: i.OrgUnit.Code || "",
        name: i.OrgUnit.Name || "",
        start_date: localDate(i.Access.StartDate),
        end_date: localDate(i.Access.EndDate),
      }));
  }

  // Files that look like the course outline, best first. Scored rather than
  // filtered so the student picks when there are several; an unsupported
  // format (.doc) is still listed so the panel can say why it's skipped.
  async function outlineCandidates(v, orgId) {
    const toc = await get(`/d2l/api/le/${v.le}/${orgId}/content/toc`);
    const out = [];
    const walk = (mods, path) => {
      for (const m of mods || []) {
        const p = [...path, m.Title];
        for (const t of m.Topics || []) {
          if (t.TypeIdentifier !== "File" || t.IsHidden) continue;
          const ext = extOf(t.Url);
          if (!SUPPORTED.has(ext) && ext !== "doc") continue;
          const title = tidy(t.Title);
          let score = 0;
          if (OUTLINE.test(title)) score += 10;
          if (OUTLINE.test(tidy(p.join(" / ")))) score += 4;
          if (!score) continue;
          if (NOT_OUTLINE.test(title)) score -= 6;
          if (SUPPORTED.has(ext)) score += 1;
          out.push({
            key: `topic:${t.TopicId != null ? t.TopicId : t.Identifier}`,
            source: "content", topicId: String(t.TopicId != null ? t.TopicId : t.Identifier),
            title: t.Title, where: p.join(" / "), ext, score,
            supported: SUPPORTED.has(ext),
          });
        }
        walk(m.Modules, p);
      }
    };
    walk(toc.Modules, []);
    return out.sort((a, b) => b.score - a.score);
  }

  // Instructors often post the outline as an attachment on the first
  // announcement instead of in Content (Laurier's CP220 does: a .docx on
  // "Course syllabus, lectures outlines, assignments…"). The file name rarely
  // says "outline" there, so the announcement title counts too.
  async function announcementOutlines(v, orgId) {
    const news = await get(`/d2l/api/le/${v.le}/${orgId}/news/`);
    const out = [];
    for (const n of news || []) {
      const titleHit = OUTLINE.test(tidy(n.Title));
      for (const a of n.Attachments || []) {
        const ext = extOf(a.FileName);
        if (!SUPPORTED.has(ext) && ext !== "doc") continue;
        let score = 0;
        if (OUTLINE.test(tidy(a.FileName))) score += 10;
        if (titleHit) score += 4;
        if (!score) continue;
        if (NOT_OUTLINE.test(tidy(a.FileName))) score -= 6;
        if (SUPPORTED.has(ext)) score += 1;
        if (a.Size > MAX_BYTES) continue;
        out.push({
          key: `news:${n.Id}:${a.FileId}`,
          source: "news", newsId: String(n.Id), fileId: String(a.FileId),
          title: a.FileName.replace(/\.[a-z0-9]+$/i, ""), where: `announcement: ${n.Title}`, ext, score,
          supported: SUPPORTED.has(ext),
        });
      }
    }
    return out;
  }

  async function outlines(v, orgId) {
    const [content, news] = await Promise.all([
      outlineCandidates(v, orgId).catch(() => []),
      announcementOutlines(v, orgId).catch(() => []),
    ]);
    return [...content, ...news].sort((a, b) => b.score - a.score);
  }

  // Dated work from the tools that carry a real deadline. The dropbox due
  // date (or its availability end) and a quiz's due date (or close time) are
  // what D2L enforces; the outline's dates are written before term and drift.
  async function deadlines(v, orgId) {
    const out = [];
    try {
      const folders = await get(`/d2l/api/le/${v.le}/${orgId}/dropbox/folders/`);
      for (const f of folders || []) {
        if (f.IsHidden) continue;
        out.push({
          kind: "dropbox", id: String(f.Id), title: f.Name,
          date: localDate(f.DueDate || (f.Availability && f.Availability.EndDate)),
        });
      }
    } catch (e) { /* the course has the dropbox tool turned off */ }
    try {
      let url = `/d2l/api/le/${v.le}/${orgId}/quizzes/`;
      while (url) {
        const page = await get(url);
        for (const q of page.Objects || []) {
          if (q.IsActive === false) continue;
          out.push({ kind: "quiz", id: String(q.QuizId), title: q.Name, date: localDate(q.DueDate || q.EndDate) });
        }
        url = page.Next ? String(page.Next).replace(/^https?:\/\/[^/]+/, "") : null;
      }
    } catch (e) { /* quizzes tool off */ }
    return out;
  }

  // The rest of the course calendar: content topics with a due date (Laurier
  // MA123 labs posts "Labs 2, 5 and 7" this way) and events an instructor
  // added by hand (a midterm, a review session). Dropbox and quiz entries are
  // skipped — deadlines() already reads those from their own tools, with ids
  // that match on re-sync. This is the same data D2L's iCal feed would carry,
  // without the student having to switch the feed on.
  async function calendarExtras(v, course) {
    const from = new Date(Date.parse(course.start_date || Date.now()) - 30 * 864e5).toISOString();
    const to = new Date(Date.parse(course.end_date || Date.now()) + 30 * 864e5).toISOString();
    let url = `/d2l/api/le/${v.le}/calendar/events/myEvents/?orgUnitIdsCSV=${course.id}`
      + `&startDateTime=${encodeURIComponent(from)}&endDateTime=${encodeURIComponent(to)}`;
    const out = [];
    const seen = new Set();
    for (let pages = 0; url && pages < 10; pages++) {
      const page = await get(url);
      for (const e of page.Objects || []) {
        const ent = e.AssociatedEntity;
        const type = ent ? String(ent.AssociatedEntityType || "") : "";
        if (/Dropbox|Quiz/i.test(type)) continue;
        const kind = ent ? (/Content/i.test(type) ? "content" : null) : "event";
        if (!kind) continue;   // other tools (discussions, surveys) aren't deadlines we model yet
        const id = String(ent ? ent.AssociatedEntityId : e.CalendarEventId);
        if (seen.has(`${kind}:${id}`)) continue;
        seen.add(`${kind}:${id}`);
        out.push({ kind, id, title: e.Title, date: localDate(e.EndDateTime || e.StartDateTime) });
      }
      url = page.Next ? String(page.Next).replace(/^https?:\/\/[^/]+/, "") : null;
    }
    return out;
  }

  async function download(v, orgId, cand) {
    const path = cand.source === "news"
      ? `/d2l/api/le/${v.le}/${orgId}/news/${cand.newsId}/attachments/${cand.fileId}`
      : `/d2l/api/le/${v.le}/${orgId}/content/topics/${cand.topicId}/file`;
    const r = await fetch(path, { credentials: "same-origin" });
    if (!r.ok) throw new Error(`download failed (${r.status})`);
    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error("outline is over 5 MB");
    return buf;
  }

  // One pass over everything the panel needs. `onProgress({ step, done,
  // total, course })` drives the fetch screen: step is "courses" then
  // "details" once per course.
  async function readAll(onProgress = () => {}, now = Date.now()) {
    onProgress({ step: "courses", done: 0, total: 1 });
    const v = await versions();
    const courses = await currentCourses(v, now);
    onProgress({ step: "courses", done: 1, total: 1, count: courses.length });
    let done = 0;
    // A few at a time: fast, without hammering the school's server.
    const queue = [...courses];
    const worker = async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        const [found, items, extras] = await Promise.all([
          outlines(v, c.id), deadlines(v, c.id), calendarExtras(v, c).catch(() => []),
        ]);
        c.outlines = found;
        c.items = [...items, ...extras];
        onProgress({ step: "details", done: ++done, total: courses.length, course: c.name });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    return { v, courses };
  }

  globalThis.TimetifyD2L = { versions, currentCourses, outlines, deadlines, download, readAll, localDate };
})();
