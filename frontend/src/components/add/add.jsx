import { useState } from "react";
import { InputFile } from "@/components/base/input/input-file";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { T, FF, MonoLabel, PillBtn, Icon, Star, Blob } from "@/components/shared/brand";

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

    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

    const stepFor = (vs) => vs === "analyzing" ? 2 : (vs === "confirming" || vs === "editing") ? 3 : 1;

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
            const data = new FormData();
            data.append("course_outline", selectedFile);

            const result = await analyzeCourse(data);
            if (result && result.success) {
                setAnalysisResult(result.data);
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

    const handleFinalize = async () => {
        setViewState("analyzing");
        const result = await finalizeCourse(analysisResult.courses);
        if (result && result.success) {
            setIsSuccess(true);
            setTimeout(() => window.location.href = "/", 2000);
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
            </div>
        );
    }

    if (viewState === "confirming" || viewState === "editing") {
        const isEdit = viewState === "editing";
        return (
            <div className="min-h-full py-12 px-4 sm:px-6 lg:px-8">
                <div className="w-full max-w-4xl mx-auto space-y-8 bg-white p-10 rounded-3xl border border-ink-8">
                    <StepIndicator step={3}/>
                    <div>
                        <MonoLabel>step 3 of 4 · we found {analysisResult.courses.length} class{analysisResult.courses.length === 1 ? '' : 'es'}</MonoLabel>
                        <h2 className="text-4xl text-ink leading-none mt-1" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
                            {isEdit ? "edit anything off" : "look right? edit anything off."}
                        </h2>
                        <p className="mt-2 text-xs text-coral-dark bg-coral-light/40 border border-coral py-2 px-3 rounded-full inline-block font-medium lowercase">
                            ⚠ ai might miss things — pls review.
                        </p>
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
                                            <input className={inputClasses("classroom")} value={course.classroom} onChange={(e) => handleUpdateCourse(cIdx, 'classroom', e.target.value)} />
                                        ) : (
                                            <p className="font-medium text-ink">{course.classroom}</p>
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        <MonoLabel>schedule</MonoLabel>
                                        {isEdit ? (
                                            <div className="flex gap-2 items-center text-sm flex-wrap">
                                                <input className="w-24 px-2 py-1 border border-ink-15 rounded-full bg-white" value={course.start_time} onChange={(e) => handleUpdateCourse(cIdx, 'start_time', e.target.value)} />
                                                <span className="text-ink-60">→</span>
                                                <input className="w-24 px-2 py-1 border border-ink-15 rounded-full bg-white" value={course.end_time} onChange={(e) => handleUpdateCourse(cIdx, 'end_time', e.target.value)} />
                                                <input className="w-32 px-2 py-1 border border-ink-15 rounded-full bg-white" value={course.rep_date} onChange={(e) => handleUpdateCourse(cIdx, 'rep_date', e.target.value)} />
                                            </div>
                                        ) : (
                                            <p className="font-medium text-ink" style={{ fontFamily: FF.mono }}>{course.rep_date} {course.start_time} – {course.end_time}</p>
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

                    <div className="flex gap-4 pt-6 border-t border-ink-8">
                        <PillBtn onClick={() => setViewState("initial")} bg="#fff" fg={T.ink60} size="lg" style={{ flex: 1, border: `1px solid ${T.ink15}` }}>
                            ← cancel
                        </PillBtn>
                        <PillBtn onClick={handleFinalize} bg={T.ink} fg={T.cream} size="lg" style={{ flex: 2 }}>
                            confirm &amp; save →
                        </PillBtn>
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
