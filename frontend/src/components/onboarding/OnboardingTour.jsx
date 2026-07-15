import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { T, FF, MonoLabel, PillBtn } from "@/components/shared/brand";

const PAD = 6; // spotlight breathing room around the target
const GAP = 14; // distance from target to the tooltip card
const CARD_W = 300;

// Pick the on-screen instance of a [data-tour="id"] anchor. The nav is rendered
// twice (desktop header + mobile bottom bar); only one is laid out at any
// breakpoint, so we take the first with real dimensions.
function findTarget(id) {
  const nodes = document.querySelectorAll(`[data-tour="${id}"]`);
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

/**
 * Spotlight coach-mark tour. Dims the page, cuts a hole over each real nav
 * element in `steps`, and floats a tooltip card beside it. Drives itself with
 * back/next; `onFinish` fires on the last step, `onSkip` on dismiss.
 */
export default function OnboardingTour({ steps, onFinish, onSkip }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  const measure = useCallback(() => {
    setRect(findTarget(step.target));
  }, [step.target]);

  // Measure after layout for the active step, and keep the hole aligned on
  // resize/orientation changes. The nav is sticky/fixed so scrolling doesn't
  // shift it — no scroll listener needed.
  useLayoutEffect(() => {
    // Synchronous measure-then-position is the intended useLayoutEffect pattern
    // here — it places the spotlight before paint so there's no flash.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measure();
    // A second pass on the next frame catches late webfont/layout shifts.
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // Esc skips the tour.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onSkip?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  const next = () => (isLast ? onFinish?.() : setIndex((i) => i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  const vw = typeof window !== "undefined" ? window.innerWidth : 360;
  const vh = typeof window !== "undefined" ? window.innerHeight : 640;
  const cardW = Math.min(CARD_W, vw - 32);

  // Card sits below a target in the top half of the screen, above one in the
  // bottom half (mobile bottom nav), and is centered when no target resolves.
  let cardStyle;
  if (rect) {
    const centerX = rect.left + rect.width / 2;
    const left = Math.max(16, Math.min(centerX - cardW / 2, vw - cardW - 16));
    const below = rect.top + rect.height / 2 < vh / 2;
    cardStyle = below
      ? { top: rect.bottom + GAP, left }
      : { bottom: vh - rect.top + GAP, left };
  } else {
    cardStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }

  const isRound = rect && Math.abs(rect.width - rect.height) < 8;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      {/* Click-blocker: swallows taps so the app can't be used mid-tour. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* Spotlight hole (dim comes from the giant box-shadow) or full dim fallback. */}
      {rect ? (
        <div
          className="absolute pointer-events-none transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            borderRadius: isRound ? 9999 : 14,
            boxShadow: "0 0 0 9999px rgba(31,26,34,0.68)",
            outline: `2px solid ${T.coral}`,
            outlineOffset: 2,
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: "rgba(31,26,34,0.68)" }} />
      )}

      {/* Tooltip card */}
      <div
        className="absolute w-[300px] max-w-[calc(100vw-32px)] bg-white rounded-3xl shadow-xl border border-ink-8 p-5"
        style={cardStyle}
      >
        <MonoLabel>{`step ${index + 1} of ${steps.length}`}</MonoLabel>
        <h3
          className="text-2xl text-ink mt-1 mb-1.5 leading-none"
          style={{ fontFamily: FF.serif, letterSpacing: -0.5 }}
        >
          {step.title}
        </h3>
        <p className="text-sm text-ink-60 leading-relaxed">{step.body}</p>

        {/* dots */}
        <div className="flex items-center gap-1.5 mt-4">
          {steps.map((s, i) => (
            <span
              key={s.target}
              className="h-1.5 rounded-full transition-all duration-200"
              style={{
                width: i === index ? 18 : 6,
                background: i === index ? T.coral : T.ink15,
              }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between mt-5">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm font-semibold text-ink-40 hover:text-ink-60 transition-colors"
          >
            skip
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={back}
                className="px-4 py-2 rounded-full text-sm font-semibold text-ink-60 hover:text-ink transition-colors"
              >
                back
              </button>
            )}
            <PillBtn type="button" onClick={next} bg={T.coral} fg="#fff" style={{ padding: "9px 18px" }}>
              {isLast ? "record my first class →" : "next →"}
            </PillBtn>
          </div>
        </div>
      </div>
    </div>
  );
}
