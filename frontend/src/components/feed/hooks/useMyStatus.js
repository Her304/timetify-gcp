import { useMemo } from "react";
import { toMins } from "../utils";

export function useMyStatus({ personalSchedule, snapsByCourse }) {
  return useMemo(() => {
    if (!personalSchedule || personalSchedule.length === 0) return null;

    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sorted = [...personalSchedule].sort(
      (a, b) => toMins(a.start_time) - toMins(b.start_time)
    );
    const ongoing = sorted.find(
      (c) => toMins(c.start_time) <= mins && mins < toMins(c.end_time)
    );
    const upcoming = sorted.find((c) => toMins(c.start_time) > mins);
    const ctx = ongoing || upcoming;
    if (!ctx) return null;

    const mySnapsForCtx = (snapsByCourse[ctx.id] || []).filter(
      (s) => s.is_mine && new Date(s.created_at) >= startOfDay
    );
    const latest = mySnapsForCtx.sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )[0];

    return {
      courseCode: ctx.course || ctx.course_id,
      snappedAt: latest ? latest.created_at : null,
    };
  }, [personalSchedule, snapsByCourse]);
}
