// Runs on Laurier's exam-schedule file (and its 404 page) — but only acts
// when the panel on MyLearningSpace just sent this tab here for a lookup
// (`pendingExamLookup` in storage). It shows the same panel the student just
// left, copies the whole page text, hands it to Timetify (which parses and
// filters it — Python, not here), leaves the results for the panel, and takes
// the tab back to MyLearningSpace, where the panel opens on them.

// Breadcrumb for debugging: where this script got to, readable from the page
// (document.documentElement.dataset.timetify). No personal data in it.
const crumb = (s) => { try { document.documentElement.dataset.timetify = s; } catch (e) {} };
crumb("started");

(async () => {
  let p;
  try {
    ({ pendingExamLookup: p } = await chrome.storage.local.get("pendingExamLookup"));
  } catch (e) {
    return crumb(`storage error: ${e.message}`);
  }
  if (!p) return crumb("no pending lookup");
  if (Date.now() - p.at > 10 * 60e3) return crumb("pending lookup is stale");
  const key = `${p.campus}${p.term}E`;
  const back = /^https:\/\/mylearningspace\.wlu\.ca\//.test(p.returnUrl) ? p.returnUrl : "https://mylearningspace.wlu.ca/d2l/home";
  const is404 = location.pathname.startsWith("/404/");
  if (is404 && !(new URLSearchParams(location.search).get("req") || "").includes(key)) return crumb("404 for another file");
  if (!is404 && !location.pathname.endsWith(`/${key}.txt`)) return crumb(`not the file for ${key}`);
  crumb("running");

  // ---- the panel, as it looked on MyLearningSpace (cream backdrop hides the raw file)
  const CAMPUS = { waterloo: "Waterloo", brantford: "Brantford", milton: "Milton" };
  const SEASON = { "01": "winter", "05": "spring", "09": "fall" };
  const host = document.createElement("div");
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
      .back { position: fixed; inset: 0; background: #f3efe6; z-index: 2147483646; }
      .panel { position: fixed; right: 20px; bottom: 76px; z-index: 2147483647; width: min(420px, calc(100vw - 32px));
               background: #fffdf8; color: #1d1b16; border: 1px solid rgba(29,27,22,.12); border-radius: 24px;
               box-shadow: 0 16px 48px rgba(0,0,0,.2); padding: 14px 18px 22px; }
      .eyebrow { font: 600 10px/1 ui-monospace, Menlo, monospace; letter-spacing: 1.6px; color: rgba(29,27,22,.5); }
      .steps { display: flex; gap: 4px; margin: 10px 0 0; }
      .steps span { flex: 1; height: 3px; border-radius: 3px; background: #ed6a4a; }
      .center { text-align: center; padding-top: 26px; }
      .spinner { width: 44px; height: 44px; margin: 0 auto 16px; border-radius: 50%; border: 4px solid rgba(237,106,74,.18); border-top-color: #ed6a4a; animation: spin .9s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      h2 { margin: 0 0 6px; font: 400 26px/1.05 Georgia, "Times New Roman", serif; letter-spacing: -.5px; }
      p { margin: 0; font-size: 13px; color: rgba(29,27,22,.6); }
      ul { list-style: none; padding: 0; margin: 18px auto 0; max-width: 260px; text-align: left; font-size: 13px; }
      li { display: flex; gap: 8px; align-items: center; padding: 5px 0; color: rgba(29,27,22,.45); }
      li.now, li.ok { color: #1d1b16; }
      .tick { width: 16px; height: 16px; border-radius: 50%; flex: none; border: 1.5px solid currentColor; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; }
      .ok .tick { background: #2f7a3a; border-color: #2f7a3a; color: #fff; }
      .now .tick { border-color: #ed6a4a; border-top-color: transparent; animation: spin .8s linear infinite; }
      .fab { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; border-radius: 999px; padding: 12px 18px 12px 14px;
             background: #1d1b16; color: #f7f2e7; font-size: 14px; display: flex; align-items: center; gap: 8px; }
      .dot { width: 18px; height: 18px; border-radius: 6px; background: #ed6a4a; color: #fff; font: 700 12px/18px Georgia, serif; text-align: center; }
    </style>
    <div class="back"></div>
    <div class="panel">
      <div class="eyebrow">timetify sync</div>
      <div class="steps"><span></span><span></span><span></span><span style="opacity:.25"></span></div>
      <div class="center">
        <div class="spinner"></div>
        <h2>checking the schedule</h2>
        <p>laurier \u00b7 ${CAMPUS[p.campus] || p.campus} \u00b7 ${SEASON[p.term.slice(4)] || ""} ${p.term.slice(0, 4)}</p>
        <ul>
          <li class="ok"><span class="tick">\u2713</span>opened laurier's exam schedule</li>
          <li class="now" id="read"><span class="tick"></span>reading it</li>
          <li id="match"><span class="tick"></span>matching ur courses</li>
          <li id="back"><span class="tick"></span>taking u back to mylearningspace</li>
        </ul>
      </div>
    </div>
    <div class="fab"><span class="dot">t</span>sync to timetify</div>`;
  const step = (id, state) => {
    const li = root.getElementById(id);
    li.className = state;
    li.querySelector(".tick").textContent = state === "ok" ? "\u2713" : "";
  };

  const finish = async (result) => {
    crumb(result.error ? `finishing with error: ${result.error.slice(0, 80)}` : "finishing ok");
    step("back", "now");
    await chrome.storage.local.set({ examResults: { ...result, uni: p.uni, campus: p.campus, term: p.term, courses: p.courses, at: Date.now() } });
    await chrome.storage.local.remove("pendingExamLookup");
    location.replace(back);
  };

  // A term that isn't posted: Laurier redirects to its 404 page.
  if (is404) return finish({ error: "laurier hasn't posted this term's exam schedule for that campus yet." });

  const text = document.body ? document.body.innerText : "";
  if (!text.includes("examSchedule")) {
    return finish({ error: "that page didn't have the exam table on it — check u're signed in to laurier and try again." });
  }
  step("read", "ok");
  step("match", "now");
  crumb("sent to timetify, waiting");
  chrome.runtime.sendMessage({ type: "examLookup", uni: p.uni, campus: p.campus, term: p.term, courses: p.courses, schedule_text: text }, (res) => {
    const err = chrome.runtime.lastError;
    step("match", "ok");
    finish(res && res.ok ? { data: res.data } : { error: (res && res.error) || (err && err.message) || "timetify didn't answer" });
  });
})().catch((e) => crumb(`crashed: ${e && e.message}`));
