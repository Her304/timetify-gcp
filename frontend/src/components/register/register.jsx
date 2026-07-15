import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { AppMark, Star, Blob, T, FF, MonoLabel, PillBtn, Icon } from "@/components/shared/brand";

const PROFILE_PIC_MAX_BYTES = 5 * 1024 * 1024;

// Downscale to ≤1024px on the long edge and re-encode as JPEG @ 0.7 — mirrors the
// profile-edit pipeline so phone-camera uploads don't ship 4 MB of raw selfie.
async function compressProfileImage(file, { maxDim = 1024, quality = 0.7 } = {}) {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => reject(new Error("decode failed"));
            im.src = url;
        });
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
        if (!blob) return file;
        const base = (file.name || "profile").replace(/\.[^.]+$/, "");
        return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
    } finally {
        URL.revokeObjectURL(url);
    }
}

// Server errors on any of these belong to step 1, so we bounce back to it if the
// final submit fails on one of them (e.g. username already taken).
const STEP1_FIELDS = [
    "username", "email", "password", "password2",
    "university", "major", "grad_year", "accepted_terms", "non_field_errors",
];

export default function Register({ registerUser, errors = {} }) {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        username: "",
        email: "",
        password: "",
        password2: "",
        university: "",
        major: "",
        grad_year: "",
        accepted_terms: false,
        marketing_opt_in: false,
    });
    const [profilePic, setProfilePic] = useState(null);
    const [profilePreview, setProfilePreview] = useState(null);
    // Client-side gate messages for step 1 (required fields / consent) before we
    // ever hit the network. Cleared as the user fixes each field.
    const [localErrors, setLocalErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [checking, setChecking] = useState(false);
    // Server errors the user has since edited away; hidden until the next submit
    // produces a fresh `errors` object (reset below), so a corrected field lets
    // the user click through again.
    const [dismissedServer, setDismissedServer] = useState({});

    const passwordsMatch = formData.password === formData.password2;

    // If the server rejects the final submit on a step-1 field, surface it by
    // returning the user to step 1.
    useEffect(() => {
        if (step === 2 && STEP1_FIELDS.some((f) => errors[f])) setStep(1);
    }, [errors, step]);

    // A fresh server response supersedes any prior dismissals.
    useEffect(() => { setDismissedServer({}); }, [errors]);

    const handleChange = (e) => {
        const { name, type, value, checked } = e.target;
        setFormData({ ...formData, [name]: type === "checkbox" ? checked : value });
        if (localErrors[name]) setLocalErrors((prev) => ({ ...prev, [name]: undefined }));
        if (errors[name]) setDismissedServer((prev) => ({ ...prev, [name]: true }));
    };

    const handlePicChange = async (e) => {
        const raw = e.target.files?.[0];
        if (!raw) return;
        if (raw.size > PROFILE_PIC_MAX_BYTES) {
            setLocalErrors((prev) => ({ ...prev, profile_picture: ["image must be 5 mb or smaller."] }));
            e.target.value = "";
            return;
        }
        setLocalErrors((prev) => ({ ...prev, profile_picture: undefined }));
        let file = raw;
        try {
            file = await compressProfileImage(raw);
        } catch (err) {
            console.warn("profile pic compression failed; uploading original", err);
        }
        setProfilePic(file);
        const reader = new FileReader();
        reader.onload = (evt) => setProfilePreview(evt.target.result);
        reader.readAsDataURL(file);
    };

    const removePic = () => {
        setProfilePic(null);
        setProfilePreview(null);
    };

    // Validate everything in step 1 before advancing so users don't discover a
    // missing field only after picking a photo.
    const validateStepOne = () => {
        const next = {};
        const required = {
            username: "username", email: "email", password: "password",
            password2: "confirm password", university: "university", major: "major", grad_year: "grad year",
        };
        for (const [field, label] of Object.entries(required)) {
            if (!String(formData[field]).trim()) next[field] = [`${label} is required.`];
        }
        if (formData.password && formData.password2 && !passwordsMatch) {
            next.password2 = ["passwords don't match."];
        }
        if (!formData.accepted_terms) {
            next.accepted_terms = ["please accept the terms to continue."];
        }
        setLocalErrors(next);
        return Object.keys(next).length === 0;
    };

    const goToStep2 = async (e) => {
        e.preventDefault();
        if (!validateStepOne()) return;
        // Catch already-registered username / email here, on the first page's
        // "next", instead of only after the photo step. Duplicate errors live in
        // localErrors, so editing a field clears them and a re-click re-checks.
        setChecking(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/register/check/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: formData.username.trim(), email: formData.email.trim() }),
            });
            if (res.ok) {
                const taken = await res.json();
                if (taken && Object.keys(taken).length > 0) {
                    setLocalErrors((prev) => ({ ...prev, ...taken }));
                    return;
                }
            }
            // A failed check (network / 5xx) must not block sign-up — the final
            // submit still enforces uniqueness server-side.
        } catch (err) {
            console.warn("availability check failed; proceeding to step 2", err);
        } finally {
            setChecking(false);
        }
        setStep(2);
    };

    const submit = async () => {
        setSubmitting(true);
        const body = new FormData();
        body.append("username", formData.username);
        body.append("email", formData.email);
        body.append("password", formData.password);
        body.append("password2", formData.password2);
        body.append("university", formData.university);
        body.append("major", formData.major);
        body.append("grad_year", formData.grad_year);
        body.append("accepted_terms", formData.accepted_terms ? "true" : "false");
        body.append("marketing_opt_in", formData.marketing_opt_in ? "true" : "false");
        if (profilePic) body.append("profile_picture", profilePic);
        try {
            await registerUser(body);
        } finally {
            setSubmitting(false);
        }
    };

    // Merge server errors with local gate messages for display. A server error the
    // user has edited away is suppressed until the next submit.
    const errorFor = (field) => localErrors[field] || (!dismissedServer[field] && errors[field]) || undefined;

    const inputClasses = (fieldName) => `
        w-full px-4 py-3 rounded-2xl border transition-all duration-200 outline-none
        ${errorFor(fieldName)
            ? "border-coral bg-coral-light/40 focus:border-coral-dark focus:ring-2 focus:ring-coral/20"
            : "border-ink-15 bg-white focus:border-coral focus:ring-2 focus:ring-coral/20"}
        placeholder:text-ink-40 text-ink text-sm
    `;

    const renderError = (fieldName) => {
        const err = errorFor(fieldName);
        if (!err) return null;
        return (
            <div className="mt-1.5 flex items-start gap-1.5">
                <svg className="w-4 h-4 text-coral mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs font-medium text-coral-dark">
                    {Array.isArray(err) ? err[0] : err}
                </p>
            </div>
        );
    };

    const labelCls = "block text-xs font-medium text-ink-60 uppercase tracking-widest mb-1.5 ml-1";
    const labelStyle = { fontFamily: FF.mono };

    const legalLink = "font-semibold text-coral hover:text-coral-dark underline underline-offset-2 transition-colors";

    return (
        <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-cream relative overflow-hidden">
            <Star color={T.lime} size={36} style={{ position: 'absolute', top: 60, right: 80, transform: 'rotate(-15deg)' }}/>
            <Blob color={T.lilac} size={140} seed={0} style={{ position: 'absolute', bottom: -40, left: -40, opacity: 0.7 }}/>
            <Star color={T.coral} size={26} style={{ position: 'absolute', bottom: 120, right: 100, transform: 'rotate(20deg)' }}/>

            <div className="max-w-md w-full space-y-7 bg-white p-10 rounded-3xl shadow-sm border border-ink-8 relative">
                <div className="flex flex-col items-center gap-4">
                    <AppMark size={56} shadow/>
                    <div className="text-center">
                        <MonoLabel>{step === 1 ? "welcome to timetify" : "one last thing"}</MonoLabel>
                        <h2 className="text-4xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
                            {step === 1 ? "make ur account" : "add a profile pic"}
                        </h2>
                    </div>
                    {/* step indicator */}
                    <div className="flex items-center gap-2" aria-label={`step ${step} of 2`}>
                        <span className={`h-2 rounded-full transition-all duration-200 ${step === 1 ? "w-6 bg-coral" : "w-2 bg-ink-15"}`} />
                        <span className={`h-2 rounded-full transition-all duration-200 ${step === 2 ? "w-6 bg-coral" : "w-2 bg-ink-15"}`} />
                    </div>
                </div>

                {step === 1 && (
                    <form className="space-y-5" onSubmit={goToStep2}>
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

                        {/* consent + marketing opt-in */}
                        <div className="space-y-3 pt-1">
                            <Checkbox
                                name="accepted_terms"
                                checked={formData.accepted_terms}
                                onChange={handleChange}
                                invalid={!!errorFor("accepted_terms")}
                            >
                                I agree to Timetify&apos;s{" "}
                                <a href="/terms" target="_blank" rel="noopener noreferrer" className={legalLink}>Terms of Service</a>,{" "}
                                <a href="/privacy" target="_blank" rel="noopener noreferrer" className={legalLink}>Privacy Policy</a>, and{" "}
                                <a href="/community" target="_blank" rel="noopener noreferrer" className={legalLink}>Community Guidelines</a>.
                            </Checkbox>
                            {errorFor("accepted_terms") && (
                                <p className="text-xs font-medium text-coral-dark ml-8 -mt-1">
                                    {Array.isArray(errorFor("accepted_terms")) ? errorFor("accepted_terms")[0] : errorFor("accepted_terms")}
                                </p>
                            )}

                            <Checkbox
                                name="marketing_opt_in"
                                checked={formData.marketing_opt_in}
                                onChange={handleChange}
                            >
                                Keep me posted with product updates, blog picks, and the occasional promo.
                                <span className="text-ink-40"> You can unsubscribe anytime.</span>
                            </Checkbox>
                        </div>

                        {errors.non_field_errors && (
                            <div className="p-3 rounded-2xl bg-coral-light/40 border border-coral flex items-center gap-2">
                                <svg className="w-5 h-5 text-coral-dark" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                <p className="text-sm font-medium text-coral-dark">{errors.non_field_errors[0]}</p>
                            </div>
                        )}

                        <PillBtn type="submit" disabled={checking} bg={T.coral} fg="#fff" size="lg" style={{ width: '100%', padding: '14px 22px' }}>
                            {checking ? "checking…" : "next →"}
                        </PillBtn>

                        <p className="text-center text-sm text-ink-60">
                            already have one?{" "}
                            <Link to="/login" className="font-semibold text-coral hover:text-coral-dark transition-colors">
                                sign in
                            </Link>
                        </p>
                    </form>
                )}

                {step === 2 && (
                    <div className="space-y-6">
                        <p className="text-center text-sm text-ink-60">
                            put a face to your handle — you can always change it later.
                        </p>

                        <div className="flex flex-col items-center gap-4">
                            <div className="relative">
                                {profilePreview ? (
                                    <img src={profilePreview} alt="profile preview" className="w-32 h-32 rounded-full object-cover ring-4 ring-lilac/40" />
                                ) : (
                                    <div className="w-32 h-32 rounded-full bg-cream border-2 border-dashed border-ink-15 flex items-center justify-center text-ink-40">
                                        <span className="material-symbols-outlined" style={{ fontSize: 52 }}>frame_person</span>
                                    </div>
                                )}
                                {profilePreview && (
                                    <button
                                        type="button"
                                        onClick={removePic}
                                        aria-label="remove photo"
                                        className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-white border border-ink-15 shadow-sm flex items-center justify-center text-ink-60 hover:text-coral-dark transition-colors"
                                    >
                                        <Icon name="x" size={16} />
                                    </button>
                                )}
                            </div>

                            <label className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-ink-15 bg-white text-sm font-semibold text-ink hover:border-coral hover:text-coral-dark transition-colors">
                                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add_reaction</span>
                                {profilePreview ? "choose another" : "choose a photo"}
                                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePicChange} className="hidden" />
                            </label>
                            {renderError("profile_picture")}
                        </div>

                        {errors.non_field_errors && (
                            <div className="p-3 rounded-2xl bg-coral-light/40 border border-coral flex items-center gap-2">
                                <svg className="w-5 h-5 text-coral-dark" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                <p className="text-sm font-medium text-coral-dark">{errors.non_field_errors[0]}</p>
                            </div>
                        )}

                        <div className="space-y-3">
                            <PillBtn type="button" onClick={submit} disabled={submitting} bg={T.coral} fg="#fff" size="lg" style={{ width: '100%', padding: '14px 22px' }}>
                                {submitting ? "creating account…" : "create account →"}
                            </PillBtn>
                            <div className="flex items-center justify-between text-sm">
                                <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-1 font-semibold text-ink-60 hover:text-ink transition-colors">
                                    <Icon name="chevL" size={16} /> back
                                </button>
                                {!profilePic && (
                                    <button type="button" onClick={submit} disabled={submitting} className="font-semibold text-ink-60 hover:text-coral-dark transition-colors">
                                        skip for now
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function Checkbox({ name, checked, onChange, invalid = false, children }) {
    return (
        <label className="flex items-start gap-3 cursor-pointer select-none">
            <span className="relative flex items-center justify-center mt-0.5 shrink-0">
                <input type="checkbox" name={name} checked={checked} onChange={onChange} className="peer sr-only" />
                <span className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors
                    ${checked ? "bg-coral border-coral" : invalid ? "border-coral bg-coral-light/40" : "border-ink-15 bg-white"}`}>
                    {checked && <Icon name="check" size={14} color="#fff" stroke={2.5} />}
                </span>
            </span>
            <span className="text-xs leading-relaxed text-ink-60">{children}</span>
        </label>
    );
}
