import { useState } from "react";
import { Link } from "react-router-dom";
import 'flowbite';

export default function Login({ loginUser, errors = {} }) {

    const [viewState, setViewState] = useState("initial"); // initial, confirming, success, error

    const [formData, setFormData] = useState({
        username: "",
        password: "",
    });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setViewState("confirming");
        try {
            await loginUser(formData);
            setViewState("success");
        } catch (error) {
            setViewState("error");
        }
    };

    const inputClasses = (fieldName) => `
        w-full px-4 py-3  border transition-all duration-200 outline-none
        ${errors[fieldName]
            ? "border-red-300 bg-red-50 focus:border-red-500 focus:ring-2 focus:ring-red-100"
            : "border-[#e8e9ed] bg-white focus:border-[#607196] focus:ring-2 focus:ring-[#607196]/20"}
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
        <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[#f5f5f3]">
            <div className="max-w-md w-full space-y-8 bg-white p-10  shadow-sm border border-[#e8e9ed]">
                <div className="text-center">
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Welcome back</h2>
                    <p className="mt-2 text-sm text-gray-500">Sign in to your Timetify account</p>
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
                                placeholder="Your username"
                                required
                            />
                            {renderError("username")}
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
                                required
                            />
                            {renderError("password")}
                            <div className="flex justify-end mt-1">
                                <a
                                    href={`${import.meta.env.VITE_API_URL}/password_reset/`}
                                    className="text-xs font-semibold text-[#607196] hover:text-[#607196]/80 transition-colors"
                                >
                                    Forgot password?
                                </a>
                            </div>
                        </div>
                    </div>

                    {/* Non-field / detail errors (e.g. wrong credentials) */}
                    {(errors.non_field_errors || errors.detail) && (
                        <div className="p-3  bg-red-50 border border-red-100 flex items-center gap-2">
                            <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            <p className="text-sm font-medium text-red-700">
                                {errors.non_field_errors?.[0] ?? errors.detail ?? "Invalid credentials."}
                            </p>
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            disabled={viewState === "confirming"}
                            className="w-full flex items-center justify-center gap-2 py-4 px-4 border border-transparent  shadow-lg text-sm font-bold text-white bg-[#607196] hover:bg-[#607196]/80 focus:outline-none focus:ring-4 focus:ring-[#607196]/20 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                        >
                            {viewState === "confirming" ? (
                                <>
                                    <svg aria-hidden="true" role="status" className="w-4 h-4 animate-spin text-white" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor" fillOpacity="0.3"/>
                                        <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentColor"/>
                                    </svg>
                                    Signing in...
                                </>
                            ) : "Sign In"}
                        </button>
                    </div>

                    <p className="text-center text-sm text-gray-500">
                        Don't have an account?{" "}
                        <Link to="/register" className="font-semibold text-[#607196] hover:text-[#607196]/80 transition-colors">
                            Create one
                        </Link>
                    </p>
                </form>
            </div>
        </div>
    );
}
