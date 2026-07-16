import { useState } from "react";
import { Link } from "react-router-dom";
import { AppMark, Star, Blob, T, FF, MonoLabel, PillBtn } from "@/components/shared/brand";

export default function ForgotPassword() {

    const [viewState, setViewState] = useState("initial");
    const [email, setEmail] = useState("");
    const [errors, setErrors] = useState({});

    const handleSubmit = async (e) => {
        e.preventDefault();
        setViewState("submitting");
        setErrors({});
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/password-reset/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            if (response.ok) {
                setViewState("sent");
            } else {
                const data = await response.json();
                setErrors(data);
                setViewState("error");
            }
        } catch (err) {
            console.error("Password reset request error:", err);
            setErrors({ non_field_errors: ["An unexpected error occurred."] });
            setViewState("error");
        }
    };

    const inputClasses = `
        w-full px-4 py-3 rounded-2xl border transition-all duration-200 outline-none
        ${errors.email
            ? "border-coral bg-coral-light/40 focus:border-coral-dark focus:ring-2 focus:ring-coral/20"
            : "border-ink-15 bg-white focus:border-coral focus:ring-2 focus:ring-coral/20"}
        placeholder:text-ink-40 text-ink text-sm
    `;

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
                            reset your password
                        </h2>
                    </div>
                </div>

                {viewState === "sent" ? (
                    <div className="space-y-5 text-center">
                        <p className="text-sm text-ink-60">
                            if an account exists for <span className="font-semibold text-ink">{email}</span>, a reset link is on its way. check your inbox.
                        </p>
                        <Link to="/login" className="font-semibold text-coral hover:text-coral-dark transition-colors text-sm">
                            back to login
                        </Link>
                    </div>
                ) : (
                    <form className="space-y-5" onSubmit={handleSubmit}>
                        <p className="text-center text-sm text-ink-60 -mt-2">
                            enter your email and we'll send you a reset link
                        </p>
                        <div>
                            <label className="block text-xs font-medium text-ink-60 uppercase tracking-widest mb-1.5 ml-1" style={{ fontFamily: FF.mono }}>email</label>
                            <input
                                type="email"
                                name="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className={inputClasses}
                                placeholder="you@university.edu"
                                required
                                autoComplete="email"
                            />
                            {errors.email && (
                                <div className="mt-1.5 flex items-start gap-1.5">
                                    <svg className="w-4 h-4 text-coral mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="text-xs font-medium text-coral-dark">
                                        {Array.isArray(errors.email) ? errors.email[0] : errors.email}
                                    </p>
                                </div>
                            )}
                        </div>

                        {errors.non_field_errors && (
                            <div className="p-3 rounded-2xl bg-coral-light/40 border border-coral flex items-center gap-2">
                                <svg className="w-5 h-5 text-coral-dark flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                <p className="text-sm font-medium text-coral-dark">
                                    {errors.non_field_errors[0]}
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
                            {viewState === "submitting" ? "sending…" : "send reset link →"}
                        </PillBtn>

                        <p className="text-center text-sm text-ink-60">
                            remember your password?{" "}
                            <Link to="/login" className="font-semibold text-coral hover:text-coral-dark transition-colors">
                                back to login
                            </Link>
                        </p>
                    </form>
                )}
            </div>
        </div>
    );
}
