import { useState, useEffect } from "react";
import { InputFile } from "@/components/base/input/input-file";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { T, FF, MonoLabel, PillBtn, Icon, Star, Blob } from "@/components/shared/brand";

const AnalyzingAd = () => {
    useEffect(() => {
        try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (e) {}
    }, []);
    return (
        <ins
            className="adsbygoogle"
            style={{ display: "block" }}
            data-ad-client="ca-pub-9825491172037028"
            data-ad-slot="5349227302"
            data-ad-format="auto"
            data-full-width-responsive="true"
        />
    );
};

// 4-step wizard indicator (drop / parsing / review / done)
const StepIndicator = ({ step }) => {
    const steps = [
        { id: 1, t: "drop ur files",   s: "syllabus, transcript, anything" },
        { id: 2, t: "parsing…",        s: "our lil robot reads it" },
        { id: 3, t: "review",          s: "check we got it right" },
        { id: 4, t: "ur set",          s: "classes added to schedule" },
    ];
    return (
        <div className="flex items-center mb-6 overflow-x-auto">
            {steps.map((s, i) => (
                <div key={s.id} className="flex items-center flex-shrink-0">
                    <div className="flex items-center gap-2.5 px-1">
                        <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                            style={{
                                background: s.id <= step ? T.coral : '#fff',
                                color: s.id <= step ? '#fff' : T.ink60,
                                border: s.id <= step ? 'none' : `1.5px solid ${T.ink15}`,
                                fontFamily: FF.mono,
                            }}
                        >
                            {s.id < step ? <Icon name="check" size={14} stroke={2.6} color="#fff"/> : s.id}
                        </div>
                        <div className="flex flex-col">
                            <span
                                className="text-sm leading-none lowercase"
                                style={{ fontFamily: FF.serif, color: s.id === step ? T.ink : T.ink60 }}
                            >
                                {s.t}
                            </span>
                            <span className="text-[9px] mt-0.5" style={{ fontFamily: FF.mono, color: T.ink40, letterSpacing: 0.5, textTransform: 'uppercase' }}>{s.s}</span>
                        </div>
                    </div>
                    {i < steps.length - 1 && (
                        <div
                            className="h-0.5 w-8 rounded-full mx-2"
                            style={{ background: s.id < step ? T.coral : T.ink08 }}
                        />
                    )}
                </div>
            ))}
        </div>
    );
};

export default function Add({ addCourse, analyzeCourse, finalizeCourse, errors = {} }) {
    const [formData, setFormData] = useState({
        course_name: "",
        course_id: "",
        classroom: "",
        start_time: "",
        end_time: "",
        rep_date: "",
        start_date: "",
        end_date: "",
    });

    const [selectedFile, setSelectedFile] = useState(null);
    const [status, setStatus] = useState("manual");
    const [viewState, setViewState] = useState("initial");
    const [analysisResult, setAnalysisResult] = useState(null);
    const [isSuccess, setIsSuccess] = useState(false);
    const [selectedDays, setSelectedDays] = useState([]);
    // null until the server reports it on the first analyze response.
    const [reparseRemaining, setReparseRemaining] = useState(null);
    const [reparseError, setReparseError] = useState(null);
    // Populated when finalize returns 400 {error: "overlap", ...}; drives the
    // dedicated conflict screen so the user doesn't have to hunt for a banner.
    const [overlapInfo, setOverlapInfo] = useState(null);

    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

    const stepFor = (vs) => vs === "analyzing" ? 2 : (vs === "confirming" || vs === "editing" || vs === "overlap") ? 3 : 1;

    const handleDayToggle = (day, isSelected) => {
        if (isSelected) setSelectedDays([...selectedDays, day]);
        else setSelectedDays(selectedDays.filter((d) => d !== day));
    };

    const handleFileChange = (files) => {
        if (!files || files.length === 0) { setSelectedFile(null); return; }
        setSelectedFile(files[0]);
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (status === "upload") {
            if (!selectedFile) return;
            setViewState("analyzing");
            setReparseError(null);
            const data = new FormData();
            data.append("course_outline", selectedFile);

            const result = await analyzeCourse(data);
            if (result && result.success) {
                setAnalysisResult(result.data);
                if (typeof result.data.reparse_remaining === "number") {
                    setReparseRemaining(result.data.reparse_remaining);
                }
                setViewState("confirming");
            } else {
                setViewState("initial");
            }
        } else {
            const formattedData = { ...formData, rep_date: selectedDays.join(",") };
            setViewState("analyzing");
            const result = await addCourse(formattedData);
            if (result && result.success) {
                setIsSuccess(true);
                setTimeout(() => window.location.href = "/", 1000);
            } else {
                setViewState("initial");
            }
        }
    };

    const handleReparse = async () => {
        if (!selectedFile) {
            setReparseError("can't reparse — try uploading again from step 1.");
            return;
        }
        if (reparseRemaining !== null && reparseRemaining <= 0) return;
        setReparseError(null);
        setViewState("analyzing");
        const data = new FormData();
        data.append("course_outline", selectedFile);
        data.append("is_reparse", "true");
        const result = await analyzeCourse(data);
        if (result && result.success) {
            setAnalysisResult(result.data);
            if (typeof result.data.reparse_remaining === "number") {
                setReparseRemaining(result.data.reparse_remaining);
            }
            setViewState("confirming");
        } else if (result && result.rateLimited) {
            setReparseRemaining(0);
            setReparseError(result.data?.details || "daily reparse limit reached.");
            setViewState("confirming");
        } else {
            setReparseError("reparse failed. try again in a moment.");
            setViewState("confirming");
        }
    };

    const handleFinalize = async () => {
        setViewState("analyzing");
        const result = await finalizeCourse(analysisResult.courses);
        if (result && result.success) {
            setIsSuccess(true);
            setTimeout(() => window.location.href = "/", 2000);
        } else if (result && result.data && result.data.error === "overlap") {
            setOverlapInfo(result.data);
            setViewState("overlap");
        } else {
            setViewState("confirming");
        }
    };

    const handleUpdateCourse = (courseIndex, field, value) => {
        const newResult = { ...analysisResult };
        newResult.courses[courseIndex][field] = value;
        setAnalysisResult(newResult);
    };

    const handleUpdateItem = (courseIndex, type, itemIndex, field, value) => {
        const newResult = { ...analysisResult };
        newResult.courses[courseIndex][type][itemIndex][field] = value;
        setAnalysisResult(newResult);
    };

    const handleRemoveItem = (courseIndex, type, itemIndex) => {
        const newResult = { ...analysisResult };
        newResult.courses[courseIndex][type].splice(itemIndex, 1);
        setAnalysisResult(newResult);
    };

    const handleAddItem = (courseIndex, type) => {
        const newResult = { ...analysisResult };
        const newItem = type === 'weeks'
            ? { week_number: newResult.courses[courseIndex].weeks.length + 1, week_topic: "" }
            : type === 'exams'
            ? { exam_topic: "", exam_date: "" }
            : { assignment_topic: "", assignment_detail: "", assignment_due: "" };
        newResult.courses[courseIndex][type].push(newItem);
        setAnalysisResult(newResult);
    };

    const handleRemoveCourse = (courseIndex) => {
        const newResult = { ...analysisResult };
        newResult.courses.splice(courseIndex, 1);
        setAnalysisResult(newResult);
        if (newResult.courses.length === 0) setViewState("initial");
    };

    // Used from the overlap screen: drop the offending incoming course by id
    // and return to the review/confirming page so the user can re-finalize.
    const handleRemoveCourseById = (courseId) => {
        const newResult = { ...analysisResult };
        newResult.courses = newResult.courses.filter((c) => c.course_id !== courseId);
        setAnalysisResult(newResult);
        setOverlapInfo(null);
        if (newResult.courses.length === 0) setViewState("initial");
        else setViewState("confirming");
    };

    const inputClasses = (fieldName) => `
        w-full px-4 py-3 rounded-2xl border transition-all duration-200 outline-none
        ${errors[fieldName]
            ? "border-coral bg-coral-light/40 focus:border-coral-dark focus:ring-2 focus:ring-coral/20"
            : "border-ink-15 bg-white focus:border-coral focus:ring-2 focus:ring-coral/20"}
        placeholder:text-ink-40 text-ink text-sm
    `;

    const labelCls = "block text-xs font-medium text-ink-60 uppercase tracking-widest mb-1.5 ml-1";
    const labelStyle = { fontFamily: FF.mono };

    const renderError = (fieldName) => {
        if (!errors[fieldName]) return null;
        return (
            <div className="mt-1.5 flex items-start gap-1.5">
                <svg className="w-4 h-4 text-coral mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs font-medium text-coral-dark">
                    {Array.isArray(errors[fieldName]) ? errors[fieldName][0] : errors[fieldName]}
                </p>
            </div>
        );
    };

    if (isSuccess) {
        return (
            <div className="min-h-full flex items-center justify-center py-12 px-4">
                <div className="w-full max-w-2xl bg-white p-10 rounded-3xl border border-ink-8 text-center space-y-5 relative overflow-hidden">
                    <Star color={T.lime} size={32} style={{ position: 'absolute', top: 24, left: 60, transform: 'rotate(-20deg)' }}/>
                    <Star color={T.coral} size={24} style={{ position: 'absolute', top: 40, right: 80, transform: 'rotate(15deg)' }}/>
                    <Blob color={T.lilac} size={90} seed={1} style={{ position: 'absolute', bottom: 14, left: 50, opacity: 0.6 }}/>
                    <StepIndicator step={4}/>
                    <MonoLabel>step 4 of 4</MonoLabel>
                    <h2 className="text-5xl text-ink leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1.5 }}>
                        ur all set.
                    </h2>
                    <p className="text-base text-ink-60">
                        ur schedule&apos;s been updated. <b className="text-coral">redirecting…</b>
                    </p>
                </div>
            </div>
        );
    }

    if (viewState === "analyzing") {
        return (
            <div className="min-h-full flex items-center justify-center py-12 px-4">
                <div className="w-full max-w-2xl bg-white p-10 rounded-3xl border border-ink-8 text-center space-y-8">
                    <StepIndicator step={2}/>
                    <div className="relative w-24 h-24 mx-auto">
                        <div className="absolute inset-0 border-4 border-ink-8 rounded-full"></div>
                        <div className="absolute inset-0 border-4 rounded-full border-t-transparent animate-spin" style={{ borderColor: T.coral, borderTopColor: 'transparent' }}></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Icon name="file" size={28} color={T.coral}/>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <MonoLabel>step 2 of 4</MonoLabel>
                        <h3 className="text-3xl text-ink leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
                            parsing ur pdfs… one sec.
                        </h3>
                        <p className="text-ink-60 text-sm">reading text · extracting times…</p>
                    </div>
                </div>

                <AnalyzingAd />
            </div>
        );
    }

    if (viewState === "overlap" && overlapInfo) {
        const a = overlapInfo.a || {};
        const b = overlapInfo.b || {};
        const incomingIds = (analysisResult?.courses || []).map((c) => c.course_id);
        const aIsIncoming = a.source === "incoming" && incomingIds.includes(a.course_id);
        const bIsIncoming = b.source === "incoming" && incomingIds.includes(b.course_id);
        // Compact multi-day strings: "Tuesday,Thursday" → "tue · thu" for readability.
        const dayShort = { Monday: "mon", Tuesday: "tue", Wednesday: "wed", Thursday: "thu", Friday: "fri", Saturday: "sat", Sunday: "sun" };
        const formatDays = (s) => {
            if (!s) return "—";
            return String(s)
                .split(",")
                .map((d) => dayShort[d.trim()] || d.trim().toLowerCase())
                .join(" · ");
        };
        const ConflictCard = ({ c, isExisting }) => (
            <div
                className="flex flex-col p-5 rounded-2xl h-full"
                style={{
                    background: isExisting ? T.cream : "#fff",
                    border: `2px solid ${isExisting ? T.ink15 : T.coral}`,
                }}
            >
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span
                        className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full whitespace-nowrap"
                        style={{
                            background: isExisting ? T.ink : T.coral,
                            color: "#fff",
                            fontFamily: FF.mono,
                            letterSpacing: 0.6,
                        }}
                    >
                        {isExisting ? "already on ur schedule" : "new — from this upload"}
                    </span>
                    <MonoLabel>{c.course_id || "—"}</MonoLabel>
                </div>
                <h4
                    className="text-xl text-ink leading-tight lowercase mb-4"
                    style={{ fontFamily: FF.serif, letterSpacing: -0.5 }}
                >
                    {c.course_name || c.course_id || "(unnamed)"}
                </h4>
                <div className="space-y-2 text-sm mt-auto" style={{ fontFamily: FF.mono }}>
                    <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-[10px] uppercase text-ink-60" style={{ letterSpacing: 0.6 }}>when</span>
                        <span className="text-ink font-semibold lowercase">
                            {formatDays(c.rep_date)} · {c.start_time || "—"}–{c.end_time || "—"}
                        </span>
                    </div>
                    {c.classroom && (
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-[10px] uppercase text-ink-60" style={{ letterSpacing: 0.6 }}>where</span>
                            <span className="text-ink-60 truncate" title={c.classroom}>{c.classroom}</span>
                        </div>
                    )}
                </div>
            </div>
        );
        return (
            <div className="min-h-full py-12 px-4 sm:px-6 lg:px-8">
                <div className="w-full max-w-3xl mx-auto space-y-7 bg-white p-10 rounded-3xl border border-ink-8">
                    <StepIndicator step={3}/>
                    <div className="text-center space-y-3">
                        <span
                            className="inline-flex items-center justify-center w-14 h-14 rounded-full"
                            style={{ background: T.coral, color: "#fff" }}
                        >
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 9v4M12 17h.01"/>
                                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            </svg>
                        </span>
                        <br/>
                        <br/>
                        <MonoLabel>step 3 of 4 · schedule conflict</MonoLabel>
                        <h2
                            className="text-4xl text-ink leading-none"
                            style={{ fontFamily: FF.serif, letterSpacing: -1 }}
                        >
                            schedule conflict.
                        </h2>
                        <p className="text-sm text-ink-60 max-w-md mx-auto leading-relaxed">
                            a class can't be in two places at once. pick one to keep, or go back and edit the times.
                        </p>
                    </div>

                    {/* Day/time strip — the single source of truth for the conflict window */}
                    <div
                        className="rounded-full py-2.5 px-4 flex items-center justify-center gap-2 flex-wrap"
                        style={{ background: T.coral, color: "#fff" }}
                    >
                        <Icon name="calendar" size={14} color="#fff"/>
                        <span className="text-xs font-bold uppercase lowercase" style={{ fontFamily: FF.mono, letterSpacing: 1 }}>
                            both meet {overlapInfo.day?.toLowerCase()} · {a.start_time || "—"}–{a.end_time || "—"}
                            {(a.start_time !== b.start_time || a.end_time !== b.end_time) && (
                                <> &amp; {b.start_time}–{b.end_time}</>
                            )}
                        </span>
                    </div>

                    {/* Two cards + a centered "vs" between them. Grid gives equal column
                        widths; cards use h-full + mt-auto so the when/where line aligns
                        across both regardless of title length. */}
                    <div className="relative grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
                        <ConflictCard c={a} isExisting={a.source === "existing"} />
                        <ConflictCard c={b} isExisting={b.source === "existing"} />
                        <div className="hidden md:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 items-center justify-center rounded-full shadow-md pointer-events-none"
                             style={{ background: T.coral, color: "#fff" }}>
                            <span className="text-[10px] font-bold uppercase" style={{ fontFamily: FF.mono, letterSpacing: 1 }}>vs</span>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <PillBtn
                            onClick={() => { setOverlapInfo(null); setViewState("confirming"); }}
                            bg={T.ink} fg={T.cream} size="lg" style={{ flex: 1 }}
                        >
                            ← go back & edit
                        </PillBtn>
                        {aIsIncoming && (
                            <PillBtn
                                onClick={() => handleRemoveCourseById(a.course_id)}
                                bg="#fff" fg={T.coralDk} size="lg"
                                style={{ flex: 1, border: `1px solid ${T.coral}` }}
                            >
                                <Icon name="trash" size={14}/>
                                drop {a.course_id}
                            </PillBtn>
                        )}
                        {bIsIncoming && (
                            <PillBtn
                                onClick={() => handleRemoveCourseById(b.course_id)}
                                bg="#fff" fg={T.coralDk} size="lg"
                                style={{ flex: 1, border: `1px solid ${T.coral}` }}
                            >
                                <Icon name="trash" size={14}/>
                                drop {b.course_id}
                            </PillBtn>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (viewState === "confirming" || viewState === "editing") {
        const isEdit = viewState === "editing";
        // Critical fields that, when blank, would produce an unusable schedule. We surface
        // these prominently so the user can fix them inline OR ask AI to try again.
        const missingFieldsByCourse = analysisResult.courses.map((c) => {
            const out = [];
            if (!c.rep_date || !String(c.rep_date).trim()) out.push("rep_date");
            if (!c.start_time || !String(c.start_time).trim()) out.push("start_time");
            if (!c.end_time || !String(c.end_time).trim()) out.push("end_time");
            if (!c.classroom || !String(c.classroom).trim()) out.push("classroom");
            return out;
        });
        const anyMissing = missingFieldsByCourse.some((m) => m.length > 0);
        const canReparse = !!selectedFile && (reparseRemaining === null || reparseRemaining > 0);
        return (
            <div className="min-h-full py-12 px-4 sm:px-6 lg:px-8">
                <div className="w-full max-w-4xl mx-auto space-y-8 bg-white p-10 rounded-3xl border border-ink-8">
                    <StepIndicator step={3}/>
                    <div>
                        <MonoLabel>step 3 of 4 · we found {analysisResult.courses.length} class{analysisResult.courses.length === 1 ? '' : 'es'}</MonoLabel>
                        <h2 className="text-4xl text-ink leading-none mt-1" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
                            {isEdit ? "edit anything off" : "look right? edit anything off."}
                        </h2>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <p className="text-xs text-coral-dark bg-coral-light/40 border border-coral py-2 px-3 rounded-full font-medium lowercase">
                                ⚠ ai might miss things — pls review.
                            </p>
                            {selectedFile && (
                                <PillBtn
                                    onClick={handleReparse}
                                    disabled={!canReparse}
                                    bg="#fff"
                                    fg={canReparse ? T.coral : T.ink60}
                                    size="sm"
                                    style={{ border: `1px solid ${canReparse ? T.coral : T.ink15}` }}
                                >
                                    <Icon name="bolt" size={14}/>
                                    {reparseRemaining === 0
                                        ? "reparse — daily limit reached"
                                        : reparseRemaining === null
                                          ? "ask ai to reparse"
                                          : `ask ai to reparse (${reparseRemaining} left today)`}
                                </PillBtn>
                            )}
                        </div>
                        {reparseError && (
                            <p className="mt-2 text-xs text-coral-dark lowercase" style={{ fontFamily: FF.mono }}>
                                {reparseError}
                            </p>
                        )}
                        {anyMissing && (
                            <div className="mt-3 p-3 rounded-2xl border border-coral bg-coral-light/30">
                                <p className="text-xs font-semibold text-coral-dark lowercase mb-1" style={{ fontFamily: FF.mono, letterSpacing: 0.4 }}>
                                    ai couldn't find everything
                                </p>
                                <p className="text-xs text-ink leading-relaxed">
                                    Some required fields are missing (highlighted below). Click <b>edit</b> on the
                                    affected class to fill them in, or use <b>ask ai to reparse</b> to try again.
                                    For multi-day classes, list each day separated by commas, e.g.{" "}
                                    <span style={{ fontFamily: FF.mono }}>Tuesday,Thursday</span>.
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="space-y-6">
                        {analysisResult.courses.map((course, cIdx) => (
                            <div key={cIdx} className="p-6 bg-cream rounded-2xl border border-ink-8 space-y-5">
                                <div className="flex justify-between items-start flex-wrap gap-3">
                                    <div className="min-w-0">
                                        <MonoLabel>{course.course_id}</MonoLabel>
                                        <h3 className="text-2xl text-ink leading-none mt-1 lowercase" style={{ fontFamily: FF.serif, letterSpacing: -0.5 }}>
                                            {course.course_name} {course.is_lab ? "(lab)" : ""}
                                        </h3>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <PillBtn
                                            onClick={() => setViewState(isEdit ? "confirming" : "editing")}
                                            bg="#fff" fg={T.coral} size="sm"
                                            style={{ border: `1px solid ${T.coral}` }}
                                        >
                                            <Icon name={isEdit ? "check" : "edit"} size={14}/>
                                            {isEdit ? "confirm changes" : "edit"}
                                        </PillBtn>
                                        <PillBtn onClick={() => handleRemoveCourse(cIdx)} bg="#fff" fg={T.coralDk} size="sm" style={{ border: `1px solid ${T.ink15}` }}>
                                            <Icon name="trash" size={14}/>
                                            delete
                                        </PillBtn>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <MonoLabel>classroom</MonoLabel>
                                        {isEdit ? (
                                            <input className={inputClasses("classroom")} value={course.classroom || ""} placeholder="e.g. SB212" onChange={(e) => handleUpdateCourse(cIdx, 'classroom', e.target.value)} />
                                        ) : course.classroom ? (
                                            <p className="font-medium text-ink">{course.classroom}</p>
                                        ) : (
                                            <p className="text-sm text-coral-dark lowercase italic" style={{ fontFamily: FF.mono }}>
                                                missing — click <b>edit</b> to add
                                            </p>
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        <MonoLabel>schedule</MonoLabel>
                                        {isEdit ? (
                                            <div className="flex flex-col gap-2 text-sm">
                                                <div className="flex gap-2 items-center flex-wrap">
                                                    <input className="w-24 px-2 py-1 border border-ink-15 rounded-full bg-white" placeholder="13:30" value={course.start_time || ""} onChange={(e) => handleUpdateCourse(cIdx, 'start_time', e.target.value)} />
                                                    <span className="text-ink-60">→</span>
                                                    <input className="w-24 px-2 py-1 border border-ink-15 rounded-full bg-white" placeholder="15:30" value={course.end_time || ""} onChange={(e) => handleUpdateCourse(cIdx, 'end_time', e.target.value)} />
                                                    <input className="flex-1 min-w-[140px] px-2 py-1 border border-ink-15 rounded-full bg-white" placeholder="Tuesday,Thursday" value={course.rep_date || ""} onChange={(e) => handleUpdateCourse(cIdx, 'rep_date', e.target.value)} />
                                                </div>
                                                <p className="text-[10px] text-ink-60 lowercase ml-2" style={{ fontFamily: FF.mono, letterSpacing: 0.4 }}>
                                                    multi-day classes: separate with commas, e.g. <b>monday,wednesday,friday</b>
                                                </p>
                                            </div>
                                        ) : course.rep_date && course.start_time && course.end_time ? (
                                            <p className="font-medium text-ink" style={{ fontFamily: FF.mono }}>{course.rep_date} {course.start_time} – {course.end_time}</p>
                                        ) : (
                                            <p className="text-sm text-coral-dark lowercase italic" style={{ fontFamily: FF.mono }}>
                                                missing {[
                                                    !course.rep_date && "days",
                                                    !course.start_time && "start",
                                                    !course.end_time && "end",
                                                ].filter(Boolean).join(", ")} — click <b>edit</b> to add
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Weeks */}
                                {(course.weeks && course.weeks.length > 0 || isEdit) && (
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center pb-1 border-b border-ink-8">
                                            <MonoLabel>weekly topics</MonoLabel>
                                            {isEdit && (
                                                <button onClick={() => handleAddItem(cIdx, 'weeks')} className="text-xs font-semibold text-coral hover:text-coral-dark flex items-center gap-1 lowercase">
                                                    <Icon name="plus" size={12} stroke={2.6}/>
                                                    add week
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 gap-2">
                                            {course.weeks.map((week, wIdx) => (
                                                <div key={wIdx} className="flex gap-3 items-center group">
                                                    <span className="text-xs font-medium text-ink-60 w-16" style={{ fontFamily: FF.mono }}>wk {week.week_number}</span>
                                                    {isEdit ? (
                                                        <>
                                                            <input className="flex-1 px-3 py-1.5 text-sm border border-ink-15 rounded-full bg-white" value={week.week_topic} onChange={(e) => handleUpdateItem(cIdx, 'weeks', wIdx, 'week_topic', e.target.value)} />
                                                            <button onClick={() => handleRemoveItem(cIdx, 'weeks', wIdx)} className="text-coral-dark opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <Icon name="trash" size={14}/>
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <p className="text-sm text-ink">{week.week_topic}</p>
                                                    )}
                                                </div>
                                            ))}
                                            {isEdit && course.weeks.length === 0 && (
                                                <p className="text-xs text-ink-40 py-2">no weekly topics yet.</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Exams */}
                                {(course.exams && course.exams.length > 0 || isEdit) && (
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center pb-1 border-b border-ink-8">
                                            <MonoLabel>exams</MonoLabel>
                                            {isEdit && (
                                                <button onClick={() => handleAddItem(cIdx, 'exams')} className="text-xs font-semibold text-coral hover:text-coral-dark flex items-center gap-1 lowercase">
                                                    <Icon name="plus" size={12} stroke={2.6}/>
                                                    add exam
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 gap-3">
                                            {course.exams.map((exam, eIdx) => (
                                                <div key={eIdx} className="bg-white p-3 rounded-xl border border-ink-8 group">
                                                    <div className="flex justify-between items-start mb-2">
                                                        {isEdit ? (
                                                            <input className="font-semibold text-sm border-b border-ink-15 focus:outline-none focus:border-coral bg-transparent" value={exam.exam_topic} onChange={(e) => handleUpdateItem(cIdx, 'exams', eIdx, 'exam_topic', e.target.value)} />
                                                        ) : (
                                                            <span className="font-semibold text-sm text-ink">{exam.exam_topic}</span>
                                                        )}
                                                        {isEdit && (
                                                            <button onClick={() => handleRemoveItem(cIdx, 'exams', eIdx)} className="text-coral-dark">
                                                                <Icon name="trash" size={14}/>
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2 text-xs text-ink-60 items-center">
                                                        <Icon name="calendar" size={12} color={T.ink60}/>
                                                        {isEdit ? (
                                                            <input type="date" className="border border-ink-15 rounded-full px-2 py-0.5 bg-white" value={exam.exam_date} onChange={(e) => handleUpdateItem(cIdx, 'exams', eIdx, 'exam_date', e.target.value)} />
                                                        ) : (
                                                            <span style={{ fontFamily: FF.mono }}>{exam.exam_date}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {isEdit && course.exams.length === 0 && (
                                                <p className="text-xs text-ink-40 py-2">no exams listed.</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Assignments */}
                                {(course.assignments && course.assignments.length > 0 || isEdit) && (
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center pb-1 border-b border-ink-8">
                                            <MonoLabel>assignments</MonoLabel>
                                            {isEdit && (
                                                <button onClick={() => handleAddItem(cIdx, 'assignments')} className="text-xs font-semibold text-coral hover:text-coral-dark flex items-center gap-1 lowercase">
                                                    <Icon name="plus" size={12} stroke={2.6}/>
                                                    add assignment
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 gap-3">
                                            {course.assignments.map((assignment, aIdx) => (
                                                <div key={aIdx} className="bg-white p-3 rounded-xl border border-ink-8 group">
                                                    <div className="flex justify-between items-start mb-2">
                                                        {isEdit ? (
                                                            <input className="font-semibold text-sm border-b border-ink-15 focus:outline-none focus:border-coral w-full bg-transparent" value={assignment.assignment_topic} onChange={(e) => handleUpdateItem(cIdx, 'assignments', aIdx, 'assignment_topic', e.target.value)} />
                                                        ) : (
                                                            <span className="font-semibold text-sm text-ink">{assignment.assignment_topic}</span>
                                                        )}
                                                        {isEdit && (
                                                            <button onClick={() => handleRemoveItem(cIdx, 'assignments', aIdx)} className="text-coral-dark ml-2">
                                                                <Icon name="trash" size={14}/>
                                                            </button>
                                                        )}
                                                    </div>
                                                    {isEdit ? (
                                                        <textarea className="w-full text-xs text-ink p-2 border border-ink-15 rounded-xl bg-white mb-2" value={assignment.assignment_detail} onChange={(e) => handleUpdateItem(cIdx, 'assignments', aIdx, 'assignment_detail', e.target.value)} placeholder="assignment details…" />
                                                    ) : (
                                                        <p className="text-xs text-ink-60 mb-2">{assignment.assignment_detail}</p>
                                                    )}
                                                    <div className="flex gap-2 text-xs items-center">
                                                        <span className="font-semibold text-coral-dark">due:</span>
                                                        {isEdit ? (
                                                            <input type="date" className="border border-ink-15 rounded-full px-2 py-0.5 bg-white" value={assignment.assignment_due} onChange={(e) => handleUpdateItem(cIdx, 'assignments', aIdx, 'assignment_due', e.target.value)} />
                                                        ) : (
                                                            <span style={{ fontFamily: FF.mono }} className="text-ink">{assignment.assignment_due}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {isEdit && course.assignments.length === 0 && (
                                                <p className="text-xs text-ink-40 py-2">no assignments listed.</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col gap-2 pt-6 border-t border-ink-8">
                        {anyMissing && (
                            <p className="text-xs text-coral-dark lowercase text-center" style={{ fontFamily: FF.mono }}>
                                fill in the highlighted fields before saving.
                            </p>
                        )}
                        <div className="flex gap-4">
                            <PillBtn onClick={() => setViewState("initial")} bg="#fff" fg={T.ink60} size="lg" style={{ flex: 1, border: `1px solid ${T.ink15}` }}>
                                ← cancel
                            </PillBtn>
                            <PillBtn onClick={handleFinalize} disabled={anyMissing} bg={T.ink} fg={T.cream} size="lg" style={{ flex: 2 }}>
                                confirm &amp; save →
                            </PillBtn>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">
            <div>
                <MonoLabel>add a class</MonoLabel>
                <h1 className="text-4xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
                    drop ur files. we&apos;ll do the rest.
                </h1>
            </div>

            <StepIndicator step={stepFor(viewState)}/>

            {/* mode toggle */}
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => setStatus("upload")}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors lowercase ${
                        status === "upload"
                            ? "bg-ink text-cream"
                            : "bg-white text-ink-60 border border-ink-15 hover:border-ink-40"
                    }`}
                >
                    upload outline
                </button>
                <span className="text-ink-40 text-xs" style={{ fontFamily: FF.mono }}>OR</span>
                <button
                    type="button"
                    onClick={() => setStatus("manual")}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors lowercase ${
                        status === "manual"
                            ? "bg-ink text-cream"
                            : "bg-white text-ink-60 border border-ink-15 hover:border-ink-40"
                    }`}
                >
                    type manually
                </button>
            </div>

            <div className="bg-white border border-ink-8 rounded-3xl p-6 sm:p-8">
                {status === "manual" ? (
                    <form className="space-y-5" onSubmit={handleSubmit}>
                        <div className="space-y-4">
                            <div>
                                <label className={labelCls} style={labelStyle}>course name</label>
                                <input type="text" name="course_name" value={formData.course_name} onChange={handleChange} className={inputClasses("course_name")} placeholder="intro to ml" required />
                                {renderError("course_name")}
                            </div>
                            <div>
                                <label className={labelCls} style={labelStyle}>course code</label>
                                <input type="text" name="course_id" value={formData.course_id} onChange={handleChange} className={inputClasses("course_id")} placeholder="cs 188" required />
                                {renderError("course_id")}
                            </div>
                            <div>
                                <label className={labelCls} style={labelStyle}>classroom</label>
                                <input type="text" name="classroom" value={formData.classroom} onChange={handleChange} className={inputClasses("classroom")} placeholder="bldg 200, rm 005" required />
                                {renderError("classroom")}
                            </div>

                            <div className="flex flex-row gap-4">
                                <div className="w-1/2">
                                    <label className={labelCls} style={labelStyle}>start time</label>
                                    <input type="time" name="start_time" value={formData.start_time} onChange={handleChange} className={inputClasses("start_time")} required />
                                    {renderError("start_time")}
                                </div>
                                <div className="w-1/2">
                                    <label className={labelCls} style={labelStyle}>end time</label>
                                    <input type="time" name="end_time" value={formData.end_time} onChange={handleChange} className={inputClasses("end_time")} required />
                                    {renderError("end_time")}
                                </div>
                            </div>

                            <div className="flex flex-row gap-4">
                                <div className="w-1/2">
                                    <label className={labelCls} style={labelStyle}>start date</label>
                                    <input type="date" name="start_date" value={formData.start_date} onChange={handleChange} className={inputClasses("start_date")} required />
                                    {renderError("start_date")}
                                </div>
                                <div className="w-1/2">
                                    <label className={labelCls} style={labelStyle}>end date</label>
                                    <input type="date" name="end_date" value={formData.end_date} onChange={handleChange} className={inputClasses("end_date")} required />
                                    {renderError("end_date")}
                                </div>
                            </div>

                            <div>
                                <label className={labelCls} style={labelStyle}>repeating days</label>
                                <div className="flex flex-col flex-wrap gap-y-2 mt-2">
                                    {days.map((day) => (
                                        <Checkbox
                                            key={day}
                                            label={day.toLowerCase()}
                                            size="md"
                                            isSelected={selectedDays.includes(day)}
                                            onChange={(isSelected) => handleDayToggle(day, isSelected)}
                                        />
                                    ))}
                                </div>
                                {renderError("rep_date")}
                            </div>

                            {(errors.non_field_errors || errors.detail) && (
                                <div className="p-3 rounded-2xl bg-coral-light/40 border border-coral flex items-center gap-2">
                                    <svg className="w-5 h-5 text-coral-dark flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                    <p className="text-sm font-medium text-coral-dark">
                                        {errors.non_field_errors?.[0] ?? errors.detail ?? "failed to add course."}
                                    </p>
                                </div>
                            )}

                            <PillBtn type="submit" bg={T.coral} fg="#fff" size="lg" style={{ width: '100%', padding: '14px 22px' }}>
                                add class →
                            </PillBtn>
                        </div>
                    </form>
                ) : (
                    <form className="space-y-5" onSubmit={handleSubmit}>
                        <div
                            className="rounded-2xl p-8 text-center relative overflow-hidden"
                            style={{ border: `2px dashed ${T.coral}`, background: T.coralLt + "55" }}
                        >
                            <Star color={T.lime} size={28} style={{ position: 'absolute', top: 16, left: 24, transform: 'rotate(-15deg)' }}/>
                            <Blob color={T.lilac} size={70} seed={2} style={{ position: 'absolute', top: 14, right: 18, opacity: 0.6 }}/>
                            <div className="flex justify-center gap-3 mb-4 relative">
                                {[
                                    { ext: 'PDF', c: T.coral, fg: '#fff', rot: -6 },
                                    { ext: 'DOCX', c: T.lilac, fg: T.ink, rot: 0 },
                                    { ext: 'JPG', c: T.lime, fg: T.ink, rot: 6 },
                                ].map((f) => (
                                    <div
                                        key={f.ext}
                                        className="w-14 h-18 rounded-lg flex flex-col items-center justify-end pb-2"
                                        style={{
                                            background: f.c, color: f.fg, transform: `rotate(${f.rot}deg)`,
                                            boxShadow: '0 6px 14px rgba(0,0,0,.1)', height: 72,
                                            fontFamily: FF.mono, fontSize: 11, fontWeight: 600, letterSpacing: 1,
                                        }}
                                    >
                                        {f.ext}
                                    </div>
                                ))}
                            </div>
                            <h3 className="text-2xl text-ink mb-1" style={{ fontFamily: FF.serif, letterSpacing: -0.5 }}>
                                drag &amp; drop ur syllabus
                            </h3>
                            <p className="text-sm text-ink-60 mb-4">pdf, docx · up to 20mb</p>
                            <InputFile
                                isRequired
                                label="browse files"
                                hint=""
                                onChange={handleFileChange}
                                isLoading={viewState === "analyzing"}
                            />
                        </div>

                        {selectedFile && (
                            <div className="p-4 bg-cream border border-ink-8 rounded-2xl flex items-center gap-3">
                                <Icon name="file" size={24} color={T.coral}/>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-ink truncate">{selectedFile.name}</p>
                                    <p className="text-xs text-ink-60" style={{ fontFamily: FF.mono }}>{(selectedFile.size / 1024 / 1024).toFixed(2)} mb</p>
                                </div>
                            </div>
                        )}

                        <PillBtn
                            type="submit"
                            bg={T.coral}
                            fg="#fff"
                            size="lg"
                            disabled={!selectedFile || viewState === "analyzing"}
                            style={{ width: '100%', padding: '14px 22px' }}
                        >
                            {viewState === "analyzing" ? "analyzing…" : "upload outline →"}
                        </PillBtn>
                    </form>
                )}
            </div>
        </div>
    );
}
