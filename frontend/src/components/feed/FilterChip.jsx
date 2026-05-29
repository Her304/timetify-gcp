import { T, FF } from "@/components/shared/brand";

const FilterChip = ({ value, label, dot, active, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(value)}
    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm transition-colors whitespace-nowrap"
    style={{
      background: active ? T.ink : "#fff",
      color: active ? T.cream : T.ink,
      border: active ? "none" : `1px solid ${T.ink15}`,
      fontFamily: FF.sans,
      fontWeight: 500,
    }}
  >
    {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />}
    <span className="lowercase">{label}</span>
  </button>
);

export default FilterChip;
