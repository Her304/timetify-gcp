import { useState } from "react";
import { Link } from "react-router-dom";
import { InputFile } from "@/components/base/input/input-file";
import { Checkbox } from "@/components/base/checkbox/checkbox";

export default function Add({ addCourse, errors = {} }) {
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
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [selectedDays, setSelectedDays] = useState([]);

    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

    const handleDayToggle = (day, isSelected) => {
        if (isSelected) {
            setSelectedDays([...selectedDays, day]);
        } else {
            setSelectedDays(selectedDays.filter((d) => d !== day));
        }
    };

    const handleFileChange = (files) => {
        if (!files || files.length === 0) {
            setSelectedFile(null);
            return;
        }
        setSelectedFile(files[0]);
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (addCourse) {
            setIsLoading(true);
            if (status === "upload") {
                if (!selectedFile) return;
                const data = new FormData();
                data.append("course_outline", selectedFile);
                // We might need to send some placeholder data if the backend requires it
                data.append("course_name", "New Course (from upload)");
                data.append("course_id", "UPLOAD");
                data.append("classroom", "TBD");
                data.append("start_time", "00:00");
                data.append("end_time", "00:00");
                data.append("start_date", new Date().toISOString().split("T")[0]);
                data.append("end_date", new Date().toISOString().split("T")[0]);
                data.append("rep_date", "TBD");

                const result = await addCourse(data);
                if (result && result.success) {
                    setIsSuccess(true);
                    setTimeout(() => window.location.href = "/", 2000);
                } else {
                    setIsLoading(false);
                }
            } else {
                // Join selected days into a comma-separated string for rep_date
                const formattedData = {
                    ...formData,
                    rep_date: selectedDays.join(","),
                };
                const result = await addCourse(formattedData);
                if (result && result.success) {
                    setIsSuccess(true);
                    setTimeout(() => window.location.href = "/", 1000);
                } else {
                    setIsLoading(false);
                }
            }
        }
    };

    const inputClasses = (fieldName) => `
        w-full px-4 py-3 rounded-xl border transition-all duration-200 outline-none
        ${errors[fieldName]
            ? "border-red-300 bg-red-50 focus:border-red-500 focus:ring-4 focus:ring-red-100"
            : "border-gray-200 bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100"}
        placeholder:text-gray-400 text-gray-900 text-sm
    `;

    const renderError = (fieldName) => {
        if (!errors[fieldName]) return null;
        return (
            <div className="mt-1.5 flex items-start gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <svg className="w-4 h-4 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs font-medium text-red-600">
                    {Array.isArray(errors[fieldName]) ? errors[fieldName][0] : errors[fieldName]}
                </p>
            </div>
        );
    };

    return (
        <div className="min-h-full flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="w-full space-y-8 bg-white/80 backdrop-blur-xl p-10 rounded-3xl shadow-xl border border-white/20">
                <div className="text-center">
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Add Your Course</h2>
                    <p className="mt-2 text-sm text-gray-500">You can type it manually or upload your course outline</p>
                </div>

                {isSuccess ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-4 animate-in fade-in zoom-in duration-500">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                            <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900">Analysis Complete!</h3>
                        <p className="text-gray-500 text-center">Your course info has been automatically extracted and saved.</p>
                        <p className="text-sm text-gray-400 animate-pulse mt-4">Redirecting to your schedule...</p>
                    </div>
                ) : isLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 space-y-8 animate-in fade-in duration-500">
                        <div className="relative w-24 h-24">
                            <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-[#ffc759] rounded-full border-t-transparent animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <svg className="w-8 h-8 text-[#ffc759] animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                </svg>
                            </div>
                        </div>
                        <div className="text-center space-y-2">
                            <h3 className="text-xl font-bold text-gray-900 animate-pulse">AI is analyzing your outline</h3>
                            <p className="text-gray-500">Extracting course details, schedule, exams, and assignments.</p>
                            <p className="text-sm text-gray-400">This might take a few moments...</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex justify-center space-x-4">
                            <button
                                onClick={() => setStatus("manual")}
                                className={`px-4 py-2 rounded-xl transition-all duration-200 ${status === "manual" ? "underline underline-offset-8 decoration-2 decoration-[#ffc759] text-[#ffc759] font-bold" : "bg-white text-[#607196]"}`}
                            >
                                Manual
                            </button>
                            <button
                                onClick={() => setStatus("upload")}
                                className={`px-4 py-2 rounded-xl transition-all duration-200 ${status === "upload" ? "underline underline-offset-8 decoration-2 decoration-[#ffc759] text-[#ffc759] font-bold" : "bg-white text-[#607196]"}`}
                            >
                                Upload
                            </button>
                        </div>

                        {status === "manual" ? (
                            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                                <div className="space-y-4">
                                    <div className="group">
                                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">Course Name</label>
                                        <input
                                            type="text"
                                            name="course_name"
                                            value={formData.course_name}
                                            onChange={handleChange}
                                            className={inputClasses("course_name")}
                                            placeholder="Your course name"
                                            required
                                        />
                                        {renderError("course_name")}
                                    </div>

                                    <div className="group">
                                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">Course Code</label>
                                        <input
                                            type="text"
                                            name="course_id"
                                            value={formData.course_id}
                                            onChange={handleChange}
                                            className={inputClasses("course_id")}
                                            placeholder="Course code"
                                            required
                                        />
                                        {renderError("course_id")}
                                    </div>

                                    <div className="group">
                                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">Classroom</label>
                                        <input
                                            type="text"
                                            name="classroom"
                                            value={formData.classroom}
                                            onChange={handleChange}
                                            className={inputClasses("classroom")}
                                            placeholder="Classroom"
                                            required
                                        />
                                        {renderError("classroom")}
                                    </div>

                                    <div className="group flex flex-row ">
                                        <div className="group w-1/2 flex flex-col pr-2">
                                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">Start Time</label>
                                            <input
                                                type="time"
                                                name="start_time"
                                                value={formData.start_time}
                                                onChange={handleChange}
                                                className={inputClasses("start_time")}
                                                placeholder="Start time"
                                                required
                                            />
                                            {renderError("start_time")}
                                        </div>
                                        <div className="group w-1/2 flex flex-col pl-2">
                                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">End Time</label>
                                            <input
                                                type="time"
                                                name="end_time"
                                                value={formData.end_time}
                                                onChange={handleChange}
                                                className={inputClasses("end_time")}
                                                placeholder="End time"
                                                required
                                            />
                                            {renderError("end_time")}
                                        </div>
                                    </div>

                                    <div className="group flex flex-row ">

                                        <div className="group w-1/2 flex flex-col pr-2">
                                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">Start Date</label>
                                            <input
                                                type="date"
                                                name="start_date"
                                                value={formData.start_date}
                                                onChange={handleChange}
                                                className={inputClasses("start_date")}
                                                placeholder="Start date"
                                                required
                                            />
                                            {renderError("start_date")}
                                        </div>

                                        <div className="group w-1/2 flex flex-col pl-2">
                                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">End Date</label>
                                            <input
                                                type="date"
                                                name="end_date"
                                                value={formData.end_date}
                                                onChange={handleChange}
                                                className={inputClasses("end_date")}
                                                placeholder="End date"
                                                required
                                            />
                                            {renderError("end_date")}
                                        </div>
                                    </div>
                                    <br />

                                    <div className="group">
                                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">Repetition Day</label>
                                        <div className="flex flex-col flex-wrap gap-y-2">
                                            {days.map((day) => (
                                                <Checkbox
                                                    key={day}
                                                    label={day}
                                                    size="md"
                                                    isSelected={selectedDays.includes(day)}
                                                    onChange={(isSelected) => handleDayToggle(day, isSelected)}
                                                />
                                            ))}
                                        </div>
                                        {renderError("rep_date")}
                                    </div>

                                    <br />

                                    {/* Non-field / detail errors (e.g. wrong credentials) */}
                                    {(errors.non_field_errors || errors.detail) && (
                                        <div className="p-3 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2">
                                            <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                            </svg>
                                            <p className="text-sm font-medium text-red-700">
                                                {errors.non_field_errors?.[0] ?? errors.detail ?? "Failed to add course."}
                                            </p>
                                        </div>
                                    )}

                                    <div>
                                        <button
                                            type="submit"
                                            className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-[#ffc759] hover:bg-transparent hover:text-[#ffc759] hover:border-[#ffc759] focus:outline-none focus:ring-4 focus:ring-[#ffc759]/20 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0"
                                        >
                                            Add Course
                                        </button>
                                    </div>
                                </div>
                            </form>

                        ) : (
                            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                                <InputFile
                                    isRequired
                                    label="Upload file"
                                    hint="Only PDF or Word File type allowed"
                                    onChange={handleFileChange}
                                    isLoading={isLoading}
                                />
                                {selectedFile && (
                                    <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-3">
                                        <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-blue-900 truncate">{selectedFile.name}</p>
                                            <p className="text-xs text-blue-600">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                        </div>
                                    </div>
                                )}
                                <br />
                                <div>
                                    <button
                                        type="submit"
                                        disabled={!selectedFile || isLoading}
                                        className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-[#ffc759] hover:bg-transparent hover:text-[#ffc759] hover:border-[#ffc759] focus:outline-none focus:ring-4 focus:ring-[#ffc759]/20 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                                    >
                                        {isLoading ? "Uploading..." : "Upload Outline"}
                                    </button>
                                </div>
                            </form>
                        )}
                    </>
                )}
            </div>
        </div>

    );
}
