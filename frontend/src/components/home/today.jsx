import { T, FF, MonoLabel } from "@/components/shared/brand";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const currentDay = days[new Date().getDay()];

export const Today = ({ Class_details }) => {
  return (
    <div className="bg-white border border-ink-8 rounded-2xl p-5 h-full flex flex-col">
      <MonoLabel>today · {currentDay.slice(0,3).toLowerCase()}</MonoLabel>
      <div className="flex flex-col gap-2 flex-1 mt-3">
        {Class_details.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-6">
            <p className="text-ink-40 text-sm">no classes today</p>
          </div>
        ) : (
          Class_details.map((course, index) => (
            <div
              key={index}
              className="bg-cream rounded-xl p-3 flex flex-col gap-1.5 border border-ink-8"
            >
              <h4 className="text-sm font-semibold text-ink lowercase">{course.course}</h4>
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
      <a href="/#schedule" className="mt-4 text-xs text-coral font-semibold hover:text-coral-dark lowercase">
        ↳ view ur weekly schedule
      </a>
    </div>
  );
};
