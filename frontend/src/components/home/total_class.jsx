const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const TotalClassSchedule = ({ Class_details = [] }) => {
  return (
    <div className="bg-[#e8e9ed]  p-5 w-full overflow-hidden">
      <div className="flex flex-row overflow-x-auto gap-3 pb-2 min-h-[280px]">
        {days.map((day) => {
          const dayClasses = Class_details.filter(
            (course) =>
              course.day &&
              (course.day.toLowerCase() === day.toLowerCase() ||
                course.day.toLowerCase() === day.slice(0, 3).toLowerCase())
          );

          return (
            <div
              key={day}
              className="flex-1 min-w-[130px] flex flex-col gap-2"
            >
              <div className="pb-2 border-b-2 border-[#607196] mb-1">
                <h3 className="text-[10px] font-bold text-[#607196] text-center uppercase tracking-widest">
                  {day.slice(0, 3)}
                </h3>
              </div>

              <div className="flex flex-col gap-2 flex-1">
                {dayClasses.length > 0 ? (
                  dayClasses.map((course, index) => (
                    <div
                      key={index}
                      className="flex flex-col p-2.5 bg-white  border border-white/80 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <h4 className="text-xs font-bold text-gray-800 mb-1.5 line-clamp-2 leading-tight">
                        {course.course}
                      </h4>
                      <p className="text-[10px] text-gray-500 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-[#607196] inline-block flex-shrink-0"></span>
                        {course.time}
                      </p>
                      <p className="text-[10px] text-gray-500 flex items-center gap-1 truncate">
                        <span className="w-1 h-1 rounded-full bg-[#ffc759] inline-block flex-shrink-0"></span>
                        {course.location}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="flex-1 flex items-center justify-center min-h-[80px]">
                    <p className="text-[10px] text-gray-400 italic">—</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {Class_details.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-gray-400 text-sm">No classes in your schedule yet.</p>
        </div>
      )}
    </div>
  );
};
