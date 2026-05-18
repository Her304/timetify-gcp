import { T, FF, MonoLabel } from "@/components/shared/brand";

export const Today_friend = ({ Class_details }) => {
  return (
    <div className="bg-white border border-ink-8 rounded-2xl p-5 h-full flex flex-col">
      <MonoLabel>u &amp; ur friends · today</MonoLabel>
      <div className="flex flex-col gap-2 flex-1 mt-3">
        {Class_details.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-6">
            <p className="text-ink-40 text-sm">no friend classes today</p>
          </div>
        ) : (
          Class_details.map((course, index) => (
            <div
              key={index}
              className="bg-cream rounded-xl p-3 flex flex-col gap-1.5 border border-ink-8"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-ink lowercase">{course.course}</h4>
                <span className="text-xs font-semibold text-coral" style={{ fontFamily: FF.mono }}>@{course.friend}</span>
              </div>
              <div className="flex flex-wrap gap-3">
                <span className="text-xs text-ink-60 flex items-center gap-1.5" style={{ fontFamily: FF.mono }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: T.coral }} />
                  {course.time}
                </span>
                <span className="text-xs text-ink-60 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: T.lime }} />
                  {course.location}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
      <a href="/friend#schedule" className="mt-4 text-xs text-coral font-semibold hover:text-coral-dark lowercase">
        ↳ view schedules together
      </a>
    </div>
  );
};
