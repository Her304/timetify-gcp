import { useState } from "react";
import { Link } from "react-router-dom";
import { AppMark, Star, Blob, T, FF, MonoLabel, PillBtn } from "@/components/shared/brand";

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
        if (!passwordsMatch && formData.password2) return;
        registerUser(formData);
    };

    const inputClasses = (fieldName) => `
        w-full px-4 py-3 rounded-2xl border transition-all duration-200 outline-none
        ${errors[fieldName]
            ? "border-coral bg-coral-light/40 focus:border-coral-dark focus:ring-2 focus:ring-coral/20"
            : "border-ink-15 bg-white focus:border-coral focus:ring-2 focus:ring-coral/20"}
        placeholder:text-ink-40 text-ink text-sm
    `;

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

    const labelCls = "block text-xs font-medium text-ink-60 uppercase tracking-widest mb-1.5 ml-1";
    const labelStyle = { fontFamily: FF.mono };

    return (
        <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-cream relative overflow-hidden">
            <Star color={T.lime} size={36} style={{ position: 'absolute', top: 60, right: 80, transform: 'rotate(-15deg)' }}/>
            <Blob color={T.lilac} size={140} seed={0} style={{ position: 'absolute', bottom: -40, left: -40, opacity: 0.7 }}/>
            <Star color={T.coral} size={26} style={{ position: 'absolute', bottom: 120, right: 100, transform: 'rotate(20deg)' }}/>

            <div className="max-w-md w-full space-y-7 bg-white p-10 rounded-3xl shadow-sm border border-ink-8 relative">
                <div className="flex flex-col items-center gap-4">
                    <AppMark size={56} shadow/>
                    <div className="text-center">
                        <MonoLabel>welcome to timetify</MonoLabel>
                        <h2 className="text-4xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
                            make ur account
                        </h2>
                    </div>
                </div>

                <form className="space-y-5" onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        <div>
                            <label className={labelCls} style={labelStyle}>username</label>
                            <input type="text" name="username" value={formData.username} onChange={handleChange} className={inputClasses("username")} placeholder="pick a unique handle" />
                            {renderError("username")}
                        </div>

                        <div>
                            <label className={labelCls} style={labelStyle}>email</label>
                            <input type="email" name="email" value={formData.email} onChange={handleChange} className={inputClasses("email")} placeholder="u@university.edu" />
                            {renderError("email")}
                        </div>

                        <div>
                            <label className={labelCls} style={labelStyle}>password</label>
                            <input type="password" name="password" value={formData.password} onChange={handleChange} className={inputClasses("password")} placeholder="••••••••" />
                            {renderError("password")}
                        </div>
                        <div>
                            <label className={labelCls} style={labelStyle}>confirm password</label>
                            <input type="password" name="password2" value={formData.password2} onChange={handleChange} className={inputClasses("password2")} placeholder="••••••••" />
                            {renderError("password2")}
                        </div>

                        <div>
                            <label className={labelCls} style={labelStyle}>university</label>
                            <input type="text" name="university" value={formData.university} onChange={handleChange} className={inputClasses("university")} placeholder="ur school" />
                            {renderError("university")}
                        </div>

                        <div>
                            <label className={labelCls} style={labelStyle}>major</label>
                            <input type="text" name="major" value={formData.major} onChange={handleChange} className={inputClasses("major")} placeholder="e.g. comp sci" />
                            {renderError("major")}
                        </div>
                        <div>
                            <label className={labelCls} style={labelStyle}>grad year</label>
                            <input type="text" name="grad_year" value={formData.grad_year} onChange={handleChange} className={inputClasses("grad_year")} placeholder="2027" />
                            {renderError("grad_year")}
                        </div>
                    </div>

                    {errors.non_field_errors && (
                        <div className="p-3 rounded-2xl bg-coral-light/40 border border-coral flex items-center gap-2">
                            <svg className="w-5 h-5 text-coral-dark" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            <p className="text-sm font-medium text-coral-dark">{errors.non_field_errors[0]}</p>
                        </div>
                    )}

                    {formData.password2 && !passwordsMatch && (
                        <div className="p-3 rounded-2xl bg-coral-light/40 border border-coral flex items-center gap-2">
                            <svg className="w-5 h-5 text-coral-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-sm font-medium text-coral-dark">passwords don&apos;t match</p>
                        </div>
                    )}

                    <PillBtn type="submit" bg={T.coral} fg="#fff" size="lg" style={{ width: '100%', padding: '14px 22px' }}>
                        create account →
                    </PillBtn>

                    <p className="text-center text-sm text-ink-60">
                        already have one?{" "}
                        <Link to="/login" className="font-semibold text-coral hover:text-coral-dark transition-colors">
                            sign in
                        </Link>
                    </p>
                </form>
            </div>
        </div>
    );
}
