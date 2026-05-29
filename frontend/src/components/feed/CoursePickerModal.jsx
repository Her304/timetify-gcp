import { FF, MonoLabel } from "@/components/shared/brand";

export default function CoursePickerModal({
  myCourses,
  personalSchedule,
  onPick,
  onClose,
}) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-cream w-full max-w-sm p-5 rounded-2xl shadow-xl border border-ink-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <MonoLabel>step 1</MonoLabel>
          <h3
            className="text-2xl text-ink leading-none mt-1"
            style={{ fontFamily: FF.serif, letterSpacing: -0.5 }}
          >
            pick a class to snap
          </h3>
        </div>
        <div className="flex flex-col gap-2">
          {myCourses.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c)}
              className="bg-white hover:bg-cream border border-ink-8 hover:border-coral rounded-xl p-3 text-left transition-colors"
            >
              <div className="text-sm font-semibold text-ink lowercase">{c.course}</div>
              <div
                className="text-[11px] text-ink-60 mt-0.5"
                style={{ fontFamily: FF.mono }}
              >
                {personalSchedule.length === 0 && c.day ? `${c.day.toLowerCase()} · ` : ""}
                {c.time} · {c.location}
              </div>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full text-xs text-ink-60 hover:text-ink lowercase"
        >
          cancel
        </button>
      </div>
    </div>
  );
}
