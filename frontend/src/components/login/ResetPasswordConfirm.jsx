import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { AppMark, Star, Blob, T, FF, MonoLabel, PillBtn } from "@/components/shared/brand";

export default function ResetPasswordConfirm() {
    const { uid, token } = useParams();

    // "checking" -> "valid" | "invalid", then "submitting"/"error" during submit, "done" on success.
    const [viewState, setViewState] = useState("checking");
    const [formData, setFormData] = useState({ new_password1: "", new_password2: "" });
    const [errors, setErrors] = useState({});

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await fetch(`${import.meta.env.VITE_API_URL}/api/password-reset/confirm/${uid}/${token}/`);
                const data = await response.json();
                if (!cancelled) setViewState(data.valid ? "valid" : "invalid");
            } catch (err) {
                console.error("Reset link validation error:", err);
                if (!cancelled) setViewState("invalid");
            }
        })();
        return () => { cancelled = true; };
    }, [uid, token]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setViewState("submitting");
        setErrors({});
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/password-reset/confirm/${uid}/${token}/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });
            const data = await response.json();
            if (response.ok) {
                setViewState("done");
            } else {
                setErrors(data);
                setViewState(data.detail ? "invalid" : "valid");
            }
        } catch (err) {
            console.error("Password reset confirm error:", err);
            setErrors({ non_field_errors: ["An unexpected error occurred."] });
            setViewState("valid");
        }
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

    return (
        <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-cream relative overflow-hidden">
            <Star color={T.lime} size={36} style={{ position: 'absolute', top: 80, left: 80, transform: 'rotate(-15deg)' }}/>
            <Blob color={T.lilac} size={140} seed={1} style={{ position: 'absolute', bottom: -40, right: -40, opacity: 0.7 }}/>
            <Star color={T.coral} size={26} style={{ position: 'absolute', top: 120, right: 100, transform: 'rotate(20deg)' }}/>

            <div className="max-w-md w-full space-y-7 bg-white p-10 rounded-3xl shadow-sm border border-ink-8 relative">
                <div className="flex flex-col items-center gap-4">
                    <AppMark size={56} shadow/>
                    <div className="text-center">
                        <MonoLabel>security</MonoLabel>
                        <h2 className="text-4xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
                            {viewState === "invalid" ? "link expired" : viewState === "done" ? "all set" : "choose a new password"}
                        </h2>
                    </div>
                </div>

                {viewState === "checking" && (
                    <p className="text-center text-sm text-ink-60">checking your reset link…</p>
                )}

                {viewState === "invalid" && (
                    <div className="space-y-5 text-center">
                        <p className="text-sm text-ink-60">
                            this password reset link has already been used or has expired. request a new one to continue.
                        </p>
                        <Link to="/reset-password">
                            <PillBtn bg={T.coral} fg="#fff" size="lg" style={{ width: '100%', padding: '14px 22px' }}>
                                request a new link →
                            </PillBtn>
                        </Link>
                    </div>
                )}

                {viewState === "done" && (
                    <div className="space-y-5 text-center">
                        <p className="text-sm text-ink-60">
                            your password has been reset. you can sign in with your new password now.
                        </p>
                        <Link to="/login">
                            <PillBtn bg={T.coral} fg="#fff" size="lg" style={{ width: '100%', padding: '14px 22px' }}>
                                back to login →
                            </PillBtn>
                        </Link>
                    </div>
                )}

                {(viewState === "valid" || viewState === "submitting") && (
                    <form className="space-y-5" onSubmit={handleSubmit}>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-ink-60 uppercase tracking-widest mb-1.5 ml-1" style={{ fontFamily: FF.mono }}>new password</label>
                                <input
                                    type="password"
                                    name="new_password1"
                                    value={formData.new_password1}
                                    onChange={handleChange}
                                    className={inputClasses("new_password1")}
                                    placeholder="••••••••"
                                    autoComplete="new-password"
                                    required
                                />
                                {renderError("new_password1")}
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-ink-60 uppercase tracking-widest mb-1.5 ml-1" style={{ fontFamily: FF.mono }}>confirm new password</label>
                                <input
                                    type="password"
                                    name="new_password2"
                                    value={formData.new_password2}
                                    onChange={handleChange}
                                    className={inputClasses("new_password2")}
                                    placeholder="••••••••"
                                    autoComplete="new-password"
                                    required
                                />
                                {renderError("new_password2")}
                            </div>
                        </div>

                        {(errors.non_field_errors || errors.detail) && (
                            <div className="p-3 rounded-2xl bg-coral-light/40 border border-coral flex items-center gap-2">
                                <svg className="w-5 h-5 text-coral-dark flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                <p className="text-sm font-medium text-coral-dark">
                                    {errors.non_field_errors?.[0] ?? errors.detail}
                                </p>
                            </div>
                        )}

                        <PillBtn
                            type="submit"
                            bg={T.coral}
                            fg="#fff"
                            size="lg"
                            disabled={viewState === "submitting"}
                            style={{ width: '100%', padding: '14px 22px' }}
                        >
                            {viewState === "submitting" ? "saving…" : "set new password →"}
                        </PillBtn>
                    </form>
                )}
            </div>
        </div>
    );
}
