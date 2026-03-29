import { useState } from "react";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const TotalClassSchedule = ({ Class_details = [] }) => {
    return (
        <div className="px-6 py-6 bg-white rounded-xl shadow-sm border border-gray-100 w-full overflow-hidden">
            <h2 className="text-xl font-bold text-gray-900 border-b pb-3 mb-6">Weekly Schedule</h2>
            
            <div className="flex flex-row overflow-x-auto gap-4 pb-4 min-h-[400px] scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                {days.map((day) => {
                    // Filter classes for the current day
                    const dayClasses = Class_details.filter(course =>
                        course.day && (course.day.toLowerCase() === day.toLowerCase() ||
                            course.day.toLowerCase() === day.slice(0, 3).toLowerCase())
                    );

                    return (
                        <div key={day} className="flex-1 min-w-[180px] flex flex-col gap-4 border-r border-gray-100 last:border-r-0 pr-4 last:pr-0">
                            <div className="sticky top-0 bg-white z-10 pb-2 border-b-2 border-blue-500 mb-2">
                                <h3 className="text-xs font-bold text-gray-800 text-center uppercase tracking-wider">
                                    {day}
                                </h3>
                            </div>
                            
                            <div className="flex flex-col gap-3 flex-1">
                                {dayClasses.length > 0 ? (
                                    dayClasses.map((course, index) => (
                                        <div
                                            key={index}
                                            className="flex flex-col p-3 bg-gray-50 rounded-lg border border-gray-200 transition-all hover:border-blue-300 hover:shadow-sm group"
                                        >
                                            <h4 className="text-xs font-bold text-gray-800 mb-2 line-clamp-2">
                                                {course.course}
                                            </h4>
                                            <div className="flex flex-col gap-1.5 mt-auto">
                                                <p className="text-[10px] text-gray-500 flex items-center">
                                                    <span className="w-1 h-1 rounded-full bg-blue-400 mr-1.5"></span>
                                                    {course.time}
                                                </p>
                                                <p className="text-[10px] text-gray-500 flex items-center truncate">
                                                    <span className="w-1 h-1 rounded-full bg-green-400 mr-1.5"></span>
                                                    {course.location}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex-1 flex items-center justify-center p-4 text-center bg-gray-50/50 rounded-lg border border-dashed border-gray-200 min-h-[120px]">
                                        <p className="text-[10px] text-gray-400 italic font-medium">No class today</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {Class_details.length === 0 && (
                <div className="p-8 mt-6 text-center bg-gray-50 rounded-lg border border-dashed">
                    <p className="text-gray-500">No classes found in the weekly schedule.</p>
                </div>
            )}
        </div>
    );
};


