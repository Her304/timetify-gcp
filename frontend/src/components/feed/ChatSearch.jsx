import { T, FF } from "@/components/shared/brand";

export default function ChatSearch({ value, onChange }) {
  return (
    <div className="flex items-center gap-2 bg-white border border-ink-8 rounded-full px-4 py-2.5">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: T.ink60, flexShrink: 0 }}
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="search groups & messages"
        className="flex-1 bg-transparent outline-none text-sm lowercase min-w-0"
        style={{ fontFamily: FF.sans, color: T.ink }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-[10px] lowercase px-2 py-0.5 rounded-full whitespace-nowrap"
          style={{
            background: T.ink8, color: T.ink60,
            fontFamily: FF.mono, letterSpacing: 0.4,
          }}
        >
          clear
        </button>
      )}
    </div>
  );
}
