const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const currentDay = days[new Date().getDay()];

export const Today_friend = ({ Class_details }) => {
  return (
    <div className="bg-[#e8e9ed]  p-5 h-full flex flex-col">
      <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
        You &amp; Your Friend Class
      </h3>
      <div className="flex flex-col gap-3 flex-1">
        {Class_details.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-6">
            <p className="text-gray-400 text-sm italic">No friend classes today</p>
          </div>
        ) : (
          Class_details.map((course, index) => (
            <div
              key={index}
              className="bg-white  p-4 flex flex-col gap-1.5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-900">{course.course}</h4>
                <span className="text-xs font-semibold text-[#607196]">@{course.friend}</span>
              </div>
              <div className="flex flex-wrap gap-3">
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#607196] inline-block"></span>
                  {course.time}
                </span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ffc759] inline-block"></span>
                  {course.location}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
      <a href="/friend#schedule" className="mt-4 text-xs text-[#607196] font-semibold hover:underline">
        &gt; view weekly schedule together
      </a>
    </div>
  );
};
