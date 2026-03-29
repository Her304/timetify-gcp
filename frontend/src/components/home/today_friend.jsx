import { useState } from "react";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const currentDay = days[new Date().getDay()];

export const Today_friend = ({ Class_details }) => {
  return (
    <div className="px-4 py-6 border-t border-gray-100 mt-auto bg-white rounded-xl shadow-sm">
      <div className="flex flex-col space-y-4">
        <h2 className="text-lg font-bold text-gray-900 border-b pb-2">{currentDay}</h2>
        <div className="flex flex-col gap-4">
          {Class_details.map((course, index) => (
            <div
              key={index}
              className="flex flex-row items-center p-4 bg-gray-50 rounded-lg border border-gray-200 transition-all group gap-8"
            >
              <div className="flex flex-col min-w-[150px]">
                <h3 className="text-md font-semibold text-blue-600 group-hover:text-blue-700 transition-colors">
                  @{course.friend}
                </h3>
              </div>

              <div className="flex flex-row items-center gap-8 flex-1">
                <h4 className="text-md font-bold text-gray-900">
                  {course.course}
                </h4>
              </div>

              <div className="flex flex-row items-center gap-8 flex-1">
                <p className="text-sm text-gray-600 flex items-center">
                  <span className="w-2 h-2 rounded-full bg-blue-400 mr-2 flex-shrink-0"></span>
                  {course.time}
                </p>
                <p className="text-sm text-gray-600 flex items-center">
                  <span className="w-2 h-2 rounded-full bg-green-400 mr-2 flex-shrink-0"></span>
                  {course.location}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
