import { useEffect, useRef } from "react";
import { T, FF, Icon, MonoLabel } from "@/components/shared/brand";

const ROWS = [
  {
    key: "class",
    label: "add class",
    hint: "from a syllabus or by hand",
    icon: "file",
    bg: T.coralLt,
    fg: T.coral,
  },
  {
    key: "event",
    label: "add event",
    hint: "social hang or study session",
    icon: "calendar",
    bg: "#E8DCF0",
    fg: T.lilacDk,
  },
];

function MenuRow({ row, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(row.key)}
      className="flex items-center gap-3 w-full px-4 py-3 text-left transition-colors hover:bg-ink-8 rounded-2xl"
    >
      <span
        className="w-10 h-10 rounded-full grid place-items-center flex-shrink-0"
        style={{ background: row.bg, color: row.fg }}
      >
        <Icon name={row.icon} size={18} color={row.fg} />
      </span>
      <span className="flex flex-col">
        <span className="text-sm lowercase font-semibold" style={{ fontFamily: FF.sans, color: T.ink }}>
          {row.label}
        </span>
        <span className="text-[11px] lowercase mt-0.5" style={{ color: T.ink60, fontFamily: FF.sans }}>
          {row.hint}
        </span>
      </span>
    </button>
  );
}

/**
 * Floating add menu shown when the user taps "+".
 *
 * Props:
 *   variant     – "popover" (desktop, anchored to "+") | "sheet" (mobile bottom sheet)
 *   onClose     – dismiss handler
 *   onAddClass  – called when "add class" picked
 *   onAddEvent  – called when "add event" picked
 */
export default function AddMenu({ variant = "popover", onClose, onAddClass, onAddEvent }) {
  const ref = useRef(null);

  useEffect(() => {
    if (variant !== "popover") return undefined;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [variant, onClose]);

  const pick = (key) => {
    if (key === "class") onAddClass?.();
    else if (key === "event") onAddEvent?.();
    onClose?.();
  };

  if (variant === "popover") {
    return (
      <div
        ref={ref}
        className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-white border border-ink-8 shadow-lg p-1.5 z-40"
        role="menu"
      >
        {ROWS.map((row) => (
          <MenuRow key={row.key} row={row} onSelect={pick} />
        ))}
      </div>
    );
  }

  // sheet (mobile)
  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl overflow-hidden flex flex-col"
        style={{ background: "#fff" }}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: T.ink15 }} />
        </div>
        <div className="px-5 pt-2 pb-1">
          <MonoLabel fs={10}>add</MonoLabel>
        </div>
        <div className="px-2 pb-6 flex flex-col gap-1">
          {ROWS.map((row) => (
            <MenuRow key={row.key} row={row} onSelect={pick} />
          ))}
        </div>
      </div>
    </>
  );
}
