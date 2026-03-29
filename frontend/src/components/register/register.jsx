import { useState } from "react";
import React from "react";

export default function Register({ registerUser, errors = {} }) {
    const [formData, setFormData] = useState({
        username: "",
        email: "",
        password: "",
        password2: "",
        university: "",
        major: "",
        grad_year: "",
    });

    const passwordsMatch = formData.password === formData.password2;

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!passwordsMatch && formData.password2) {
            // Ideally we'd set an error here, but for now we'll just prevent submission
            // and let the UI show the mismatch state.
            return;
        }
        registerUser(formData);
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
            <div className="max-w-md w-full space-y-8 bg-white/80 backdrop-blur-xl p-10 rounded-3xl shadow-xl border border-white/20">
                <div className="text-center">
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Create your account</h2>
                    <p className="mt-2 text-sm text-gray-500">Join Timetify to sync schedules with friends</p>
                </div>

                <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        <div className="group">
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">Username</label>
                            <input
                                type="text"
                                name="username"
                                value={formData.username}
                                onChange={handleChange}
                                className={inputClasses("username")}
                                placeholder="Choose a unique username"
                            />
                            {renderError("username")}
                        </div>

                        <div className="group">
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">Email address</label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                className={inputClasses("email")}
                                placeholder="you@university.edu"
                            />
                            {renderError("email")}
                        </div>

                        <div className="group">
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">Password</label>
                            <input
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                className={inputClasses("password")}
                                placeholder="••••••••"
                            />
                            {renderError("password")}
                        </div>
                        <div className="group">
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">Confirm Your Password

                            </label>
                            <input
                                type="password"
                                name="password2"
                                value={formData.password2}
                                onChange={handleChange}
                                className={inputClasses("password2")}
                                placeholder="••••••••"
                            />
                            {renderError("password2")}
                        </div>

                        <div className="group">
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">University</label>
                            <input
                                type="text"
                                name="university"
                                value={formData.university}
                                onChange={handleChange}
                                className={inputClasses("university")}
                                placeholder="Name of your university"
                            />
                            {renderError("university")}
                        </div>

                        <div className="group">
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">Major</label>
                            <input
                                type="text"
                                name="major"
                                value={formData.major}
                                onChange={handleChange}
                                className={inputClasses("major")}
                                placeholder="e.g. Computer Science"
                            />
                            {renderError("major")}
                        </div>
                        <div className="group">
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">Grad Year</label>
                            <input
                                type="text"
                                name="grad_year"
                                value={formData.grad_year}
                                onChange={handleChange}
                                className={inputClasses("grad_year")}
                                placeholder="2026"
                            />
                            {renderError("grad_year")}
                        </div>
                    </div>


                    {errors.non_field_errors && (
                        <div className="p-3 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2 animate-pulse">
                            <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            <p className="text-sm font-medium text-red-700">{errors.non_field_errors[0]}</p>
                        </div>
                    )}

                    {formData.password2 && !passwordsMatch && (
                        <div className="p-3 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2">
                            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-sm font-medium text-red-700">Passwords do not match</p>
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-[#607196] hover:bg-[#607196]/80 focus:outline-none focus:ring-4 focus:ring-[#607196]/20 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0"
                        >
                            Create Account
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}