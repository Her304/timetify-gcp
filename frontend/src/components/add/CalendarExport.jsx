import { useState } from "react";
import { authenticatedFetch } from "@/utils/api";
import { T, FF, MonoLabel, PillBtn, Icon } from "@/components/shared/brand";

// Google can't take a file from a link (short of OAuth) — only through the
// import page on its desktop site.
const GOOGLE_IMPORT_URL = "https://calendar.google.com/calendar/r/settings/import";

// Phones/tablets: Google's app can't import files and its import page isn't
// usable there, so opening it would be a dead end.
const onTouchDevice = () => window.matchMedia?.("(pointer: coarse)").matches ?? false;

const REMINDER_OPTIONS = [
    [0, "no reminder"],
    [10, "10 min before"],
    [15, "15 min before"],
    [30, "30 min before"],
    [60, "1 hour before"],
    [1440, "1 day before"],
    [7 * 1440, "1 week before"],
    [14 * 1440, "2 weeks before"],
];

const requestCalendarFile = async ({ coursePks, include, reminders }) => {
    const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/courses/calendar-link/`, {
        method: "POST",
        body: JSON.stringify({
            course_pks: coursePks,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
            ...(include ? { include } : {}),
            ...(reminders ? { reminders } : {}),
        }),
    });
    if (!res.ok) throw new Error(`calendar-link ${res.status}`);
    const { url } = await res.json();
    return url;
};

// "add to ur calendar" box on the Add page's "ur all set" screen: a one-time
// .ics of the classes the upload just saved (course pks from finalize).
// `notExported` = exams/assignments saved as TBA or estimated, which the file
// leaves out (calendar_export._exportable) — said here so nobody hunts for them.
export default function CalendarExport({
    coursePks,
    notExported = 0,
    description = "ur classes, exams + due dates, in the calendar u already use.",
}) {
    const [busy, setBusy] = useState(null); // "apple" | "google" | null
    const [note, setNote] = useState(null); // { tone: "info" | "error", text }

    const openCalendarFile = async () => {
        const url = await requestCalendarFile({ coursePks });
        // A plain navigation, not fetch + blob: iOS only offers "Add to
        // Calendar" for a real response, and desktop browsers download
        // text/calendar without leaving the page.
        window.location.assign(`${import.meta.env.VITE_API_URL}${url}`);
    };

    const handleClick = async (kind) => {
        setNote(null);
        if (kind === "google") {
            if (onTouchDevice()) {
                setNote({ tone: "info", text: "google calendar's app can't import files. open timetify on a computer and tap google calendar there." });
                return;
            }
            // Before any await: after one, the click no longer counts as a user
            // gesture and the popup blocker eats the new tab.
            window.open(GOOGLE_IMPORT_URL, "_blank", "noopener");
        }
        setBusy(kind);
        try {
            await openCalendarFile();
            if (kind === "google") {
                setNote({ tone: "info", text: "on google's import page, pick the timetify .ics file that just downloaded." });
            }
        } catch {
            setNote({ tone: "error", text: "couldn't make ur calendar file. try again in a sec." });
        } finally {
            setBusy(null);
        }
    };

    const btnStyle = { flex: 1, border: `1px solid ${T.ink15}` };

    return (
        <div className="w-full mt-8 p-5 rounded-2xl text-left" style={{ background: T.cream, border: `1px solid ${T.ink08}` }}>
            <div className="flex items-center gap-2">
                <Icon name="calendar" size={16} color={T.coralDk}/>
                <MonoLabel color={T.coralDk}>add to ur calendar</MonoLabel>
            </div>
            <p className="mt-1.5 text-sm text-ink-60 leading-relaxed">
                {description}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <PillBtn onClick={() => handleClick("apple")} disabled={!!busy} bg="#fff" fg={T.ink} style={btnStyle}>
                    {busy === "apple" ? "opening…" : "apple calendar"}
                </PillBtn>
                <PillBtn onClick={() => handleClick("google")} disabled={!!busy} bg="#fff" fg={T.ink} style={btnStyle}>
                    {busy === "google" ? "opening…" : "google calendar"}
                </PillBtn>
            </div>
            <p className="mt-3 text-[11px] text-ink-60 lowercase leading-relaxed" style={{ fontFamily: FF.mono }}>
                apple (+ outlook) opens the file directly. google only imports on a computer: we download the file + open google&apos;s import page.
            </p>
            {notExported > 0 && (
                <p className="mt-2 text-[11px] text-ink-60 lowercase leading-relaxed" style={{ fontFamily: FF.mono }}>
                    {notExported} exam{notExported === 1 ? "" : "s"}/assignment{notExported === 1 ? "" : "s"} with a tba or estimated date
                    {notExported === 1 ? " isn't" : " aren't"} in the file. they&apos;re on timetify. add the real date there once it&apos;s out.
                </p>
            )}
            {note && (
                <p
                    role="status"
                    className={`mt-2 text-xs lowercase ${note.tone === "error" ? "text-coral-dark" : "text-ink"}`}
                    style={{ fontFamily: FF.mono }}
                >
                    {note.text}
                </p>
            )}
        </div>
    );
}

// Per-course export dialog from the profile archive. Its selected categories
// and reminders are embedded in the signed export link, so the `.ics` contains
// only this course's requested events and calendar-native VALARMs.
export function CourseCalendarExportModal({ course, onClose }) {
    const [include, setInclude] = useState({ classes: true, exams: true, assignments: true });
    const [reminders, setReminders] = useState({ classes: 15, exams: 60, assignments: 60 });
    const [calendar, setCalendar] = useState("apple");
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState(null);

    if (!course) return null;
    const selectedCount = Object.values(include).filter(Boolean).length;
    const options = [
        { key: "classes", label: "class meetings", hint: "recurring time + room" },
        { key: "exams", label: "exams", hint: "dated exams only" },
        { key: "assignments", label: "assignments", hint: "dated due dates only" },
    ];

    const handleExport = async () => {
        if (!selectedCount) return;
        setBusy(true);
        setNote(null);
        if (calendar === "google") {
            if (onTouchDevice()) {
                setBusy(false);
                setNote("google calendar imports files on a computer. use apple calendar here, or open timetify on desktop.");
                return;
            }
            // Keep this before the await so a popup blocker recognises the tap.
            window.open(GOOGLE_IMPORT_URL, "_blank", "noopener");
        }
        try {
            const url = await requestCalendarFile({
                coursePks: [course.id],
                include,
                reminders,
            });
            window.location.assign(`${import.meta.env.VITE_API_URL}${url}`);
            if (calendar === "google") {
                setNote("the .ics file is downloading. choose it on google calendar's import page.");
            }
        } catch {
            setNote("couldn't make ur calendar file. try again in a sec.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={`export ${course.course_id} calendar`}
                className="w-full max-w-md rounded-3xl overflow-hidden"
                style={{ background: T.ink, color: "#fff", maxHeight: "90vh" }}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,.10)" }}>
                    <div>
                        <MonoLabel color="rgba(255,255,255,.55)" fs={10}>calendar export</MonoLabel>
                        <h2 className="text-2xl leading-none mt-1 lowercase" style={{ fontFamily: FF.serif, letterSpacing: -0.5 }}>
                            {course.course_id}
                        </h2>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full grid place-items-center" style={{ background: "rgba(255,255,255,.12)" }} aria-label="close export calendar">
                        <Icon name="x" size={14} color="#fff" />
                    </button>
                </div>

                <div className="px-5 py-5 overflow-y-auto space-y-5">
                    <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,.72)" }}>
                        choose exactly what to add for this class. nothing from ur other courses is included.
                    </p>

                    <div className="space-y-2">
                        <MonoLabel color="rgba(255,255,255,.55)" fs={10}>include + reminders</MonoLabel>
                        {options.map(({ key, label, hint }) => {
                            const enabled = include[key];
                            return (
                                <div key={key} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: enabled ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.10)" }}>
                                    <button
                                        type="button"
                                        aria-pressed={enabled}
                                        aria-label={`${enabled ? "exclude" : "include"} ${label}`}
                                        onClick={() => setInclude((current) => ({ ...current, [key]: !current[key] }))}
                                        className="w-7 h-7 rounded-full shrink-0 grid place-items-center"
                                        style={{ background: enabled ? T.coral : "rgba(255,255,255,.10)" }}
                                    >
                                        {enabled && <Icon name="check" size={14} color="#fff" />}
                                    </button>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold lowercase">{label}</p>
                                        <p className="text-[11px] lowercase" style={{ color: "rgba(255,255,255,.55)", fontFamily: FF.mono }}>{hint}</p>
                                    </div>
                                    <select
                                        aria-label={`${label} reminder`}
                                        disabled={!enabled}
                                        value={reminders[key]}
                                        onChange={(event) => setReminders((current) => ({ ...current, [key]: Number(event.target.value) }))}
                                        className="max-w-32 rounded-full px-2 py-1 text-[11px] outline-none disabled:opacity-35"
                                        style={{ background: "#fff", color: T.ink, fontFamily: FF.mono }}
                                    >
                                        {REMINDER_OPTIONS.map(([minutes, labelText]) => <option key={minutes} value={minutes}>{labelText}</option>)}
                                    </select>
                                </div>
                            );
                        })}
                    </div>

                    <div className="space-y-2">
                        <MonoLabel color="rgba(255,255,255,.55)" fs={10}>calendar</MonoLabel>
                        <div className="grid grid-cols-2 gap-2">
                            {["apple", "google"].map((tool) => {
                                const active = calendar === tool;
                                return (
                                    <button
                                        key={tool}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => setCalendar(tool)}
                                        className="rounded-xl px-3 py-3 text-sm font-semibold lowercase transition-colors"
                                        style={{ background: active ? T.coral : "rgba(255,255,255,.08)", border: `1px solid ${active ? T.coral : "rgba(255,255,255,.12)"}`, color: "#fff" }}
                                    >
                                        {tool} calendar
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {note && <p role="status" className="text-xs lowercase" style={{ color: note.startsWith("couldn't") ? T.coral : "rgba(255,255,255,.75)", fontFamily: FF.mono }}>{note}</p>}
                </div>

                <div className="px-5 py-4 border-t" style={{ borderColor: "rgba(255,255,255,.10)" }}>
                    <PillBtn onClick={handleExport} disabled={busy || !selectedCount} bg={T.coral} fg="#fff" size="lg" style={{ width: "100%" }}>
                        <Icon name="calendar" size={15} />
                        {busy ? "exporting…" : `export to ${calendar} calendar`}
                    </PillBtn>
                    {!selectedCount && <p className="mt-2 text-center text-[11px] lowercase" style={{ color: T.coral }}>choose at least one item type.</p>}
                </div>
            </div>
        </div>
    );
}
