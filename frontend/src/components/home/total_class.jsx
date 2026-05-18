import { T, FF } from "@/components/shared/brand";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const TotalClassSchedule = ({ Class_details = [] }) => {
  // pull palette colors for each day's accent dot
  const dayColors = [T.coral, T.lilac, T.lime, "#b8d8c2", "#f0c4a8", T.coral, T.lilac];

  return (
    <div className="bg-white rounded-2xl border border-ink-8 p-5 w-full overflow-hidden">
      <div className="flex flex-row overflow-x-auto gap-3 pb-2 min-h-[280px]">
        {days.map((day, dayIdx) => {
          const dayClasses = Class_details.filter(
            (course) =>
              course.day &&
              (course.day.toLowerCase() === day.toLowerCase() ||
                course.day.toLowerCase() === day.slice(0, 3).toLowerCase())
          );

          const dayColor = dayColors[dayIdx % dayColors.length];

          return (
            <div
              key={day}
              className="flex-1 min-w-[130px] flex flex-col gap-2"
            >
              <div className="pb-2 mb-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: dayColor }} />
                <h3 className="text-[10px] font-medium text-ink-60 uppercase tracking-widest" style={{ fontFamily: FF.mono }}>
                  {day.slice(0, 3)}
                </h3>
              </div>

              <div className="flex flex-col gap-2 flex-1">
                {dayClasses.length > 0 ? (
                  dayClasses.map((course, index) => (
                    <div
                      key={index}
                      className="flex flex-col p-2.5 bg-cream rounded-xl border border-ink-8 hover:border-coral transition-colors"
                    >
                      <h4 className="text-xs font-semibold text-ink mb-1 line-clamp-2 leading-tight lowercase">
                        {course.course}
                      </h4>
                      <p className="text-[10px] text-ink-60 flex items-center gap-1.5" style={{ fontFamily: FF.mono }}>
                        <span className="w-1 h-1 rounded-full" style={{ background: T.coral }} />
                        {course.time}
                      </p>
                      <p className="text-[10px] text-ink-60 flex items-center gap-1.5 truncate">
                        <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: T.lime }} />
                        {course.location}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="flex-1 flex items-center justify-center min-h-[80px]">
                    <p className="text-[10px] text-ink-40">—</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {Class_details.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-ink-60 text-sm">no classes in ur schedule yet.</p>
        </div>
      )}
    </div>
  );
};
