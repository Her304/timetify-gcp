import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { authenticatedFetch } from "../../utils/api";
import Register from "@/components/register/register";
import { AppMark, Star, Blob, T, FF, MonoLabel, PillBtn } from "@/components/shared/brand";

// Landing page for a personal invite link (/invite/<code>). A logged-out visitor
// gets the normal sign-up flow with an "@user invited you" banner (and is
// auto-friended on register, server-side). A logged-in visitor is friended with
// the inviter immediately and bounced to the feed.
export default function InviteLanding({ currentUser, registerUser, registrationErrors = {} }) {
    const { code } = useParams();
    const navigate = useNavigate();
    const [inviter, setInviter] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    // For the logged-in accept path: "connecting" | "done" | "error".
    const [acceptState, setAcceptState] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/invite/${code}/`);
                if (cancelled) return;
                if (!res.ok) {
                    setNotFound(true);
                    return;
                }
                const data = await res.json();
                setInviter(data.inviter);

                // Already signed in → connect the two accounts now, then move on.
                if (currentUser) {
                    if (data.inviter?.id === currentUser.id) {
                        setAcceptState("done"); // own link — nothing to do
                        return;
                    }
                    setAcceptState("connecting");
                    const ares = await authenticatedFetch(
                        `${import.meta.env.VITE_API_URL}/api/invite/${code}/accept/`,
                        { method: "POST" },
                    );
                    if (cancelled) return;
                    setAcceptState(ares.ok ? "done" : "error");
                }
            } catch {
                if (!cancelled) setNotFound(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        run();
        return () => { cancelled = true; };
    }, [code, currentUser]);

    // ── Logged-out visitor: the sign-up flow, carrying the invite through ──────
    if (!currentUser) {
        if (loading) return <Splash label="loading invite…" />;
        if (notFound) return <InviteNotFound />;
        return (
            <Register
                registerUser={registerUser}
                errors={registrationErrors}
                inviteInfo={{ code, inviter }}
            />
        );
    }

    // ── Logged-in visitor: friend + confirm ───────────────────────────────────
    if (loading || acceptState === "connecting") return <Splash label="connecting you…" />;
    if (notFound) return <InviteNotFound />;

    const isOwn = inviter?.id === currentUser.id;
    return (
        <Shell>
            {acceptState === "error" ? (
                <>
                    <MonoLabel>hmm</MonoLabel>
                    <h2 className="text-3xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -0.8 }}>
                        couldn&apos;t connect
                    </h2>
                    <p className="text-sm text-ink-60 mt-3">something went wrong adding this friend. try the link again in a bit.</p>
                </>
            ) : (
                <>
                    <MonoLabel>{isOwn ? "that's you" : "you're connected"}</MonoLabel>
                    <h2 className="text-3xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -0.8 }}>
                        {isOwn ? "this is your invite link" : `you & @${inviter?.username} are now friends`}
                    </h2>
                    <p className="text-sm text-ink-60 mt-3">
                        {isOwn
                            ? "share it with friends so they land straight in your circle."
                            : "their schedule and snaps will show up in your feed."}
                    </p>
                </>
            )}
            <div className="mt-6">
                <PillBtn onClick={() => navigate("/feed")} bg={T.coral} fg="#fff" size="md">go to feed →</PillBtn>
            </div>
        </Shell>
    );
}

function Shell({ children }) {
    return (
        <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-cream relative overflow-hidden">
            <Star color={T.lime} size={36} style={{ position: "absolute", top: 60, right: 80, transform: "rotate(-15deg)" }} />
            <Blob color={T.lilac} size={140} seed={0} style={{ position: "absolute", bottom: -40, left: -40, opacity: 0.7 }} />
            <div className="max-w-md w-full bg-white p-10 rounded-3xl shadow-sm border border-ink-8 relative text-center flex flex-col items-center">
                <AppMark size={56} shadow />
                <div className="mt-5">{children}</div>
            </div>
        </div>
    );
}

function Splash({ label }) {
    return (
        <Shell>
            <p className="text-sm text-ink-60 lowercase" style={{ fontFamily: FF.mono }}>{label}</p>
        </Shell>
    );
}

function InviteNotFound() {
    return (
        <Shell>
            <MonoLabel>oops</MonoLabel>
            <h2 className="text-3xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -0.8 }}>
                invite not found
            </h2>
            <p className="text-sm text-ink-60 mt-3">this invite link is invalid or has expired.</p>
            <div className="mt-6">
                <Link to="/register">
                    <PillBtn bg={T.coral} fg="#fff" size="md">make an account →</PillBtn>
                </Link>
            </div>
        </Shell>
    );
}
