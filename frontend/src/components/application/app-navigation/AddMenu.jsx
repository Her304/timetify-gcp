import { useEffect, useRef } from "react";
import { T, FF, MonoLabel } from "@/components/shared/brand";

// Material Symbols — viewBox "0 -960 960 960", fill via `currentColor`.
const AssignmentAddIcon = ({ size = 18 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" height={size} width={size} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
    <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h168q13-36 43.5-58t68.5-22q38 0 68.5 22t43.5 58h168q33 0 56.5 23.5T840-760v268q-19-9-39-15.5t-41-9.5v-243H200v560h242q3 22 9.5 42t15.5 38H200Zm0-120v40-560 243-3 280Zm80-40h163q3-21 9.5-41t14.5-39H280v80Zm0-160h244q32-30 71.5-50t84.5-27v-3H280v80Zm0-160h400v-80H280v80Zm221.5-198.5Q510-807 510-820t-8.5-21.5Q493-850 480-850t-21.5 8.5Q450-833 450-820t8.5 21.5Q467-790 480-790t21.5-8.5ZM720-40q-83 0-141.5-58.5T520-240q0-83 58.5-141.5T720-440q83 0 141.5 58.5T920-240q0 83-58.5 141.5T720-40Zm-20-80h40v-100h100v-40H740v-100h-40v100H600v40h100v100Z" />
  </svg>
);

const CalendarAddOnIcon = ({ size = 18 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" height={size} width={size} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
    <path d="M680-80v-120H560v-80h120v-120h80v120h120v80H760v120h-80Zm-480-80q-33 0-56.5-23.5T120-240v-480q0-33 23.5-56.5T200-800h40v-80h80v80h240v-80h80v80h40q33 0 56.5 23.5T760-720v244q-20-3-40-3t-40 3v-84H200v320h280q0 20 3 40t11 40H200Zm0-480h480v-80H200v80Zm0 0v-80 80Z" />
  </svg>
);

const ROWS = [
  {
    key: "class",
    label: "add class",
    hint: "from a syllabus or by hand",
    Icon: AssignmentAddIcon,
    bg: T.coralLt,
    fg: T.coral,
  },
  {
    key: "event",
    label: "add event",
    hint: "social hang or study session",
    Icon: CalendarAddOnIcon,
    bg: "#E8DCF0",
    fg: T.lilacDk,
  },
];

function MenuRow({ row, onSelect }) {
  const RowIcon = row.Icon;
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
        <RowIcon size={18} />
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
