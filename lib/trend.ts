import { shiftDate } from "@/lib/date";
import type { DailyLogSummary } from "@/types/domain";

const weekdayFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  weekday: "short",
});

export function buildWeeklyTrend(summaries: DailyLogSummary[], to: string) {
  const byDate = new Map(summaries.map((summary) => [summary.date, summary]));

  return Array.from({ length: 7 }, (_, index) => {
    const date = shiftDate(to, index - 6);
    const summary = byDate.get(date);
    const label = weekdayFormatter.format(new Date(`${date}T12:00:00+09:00`)).replace("曜日", "");

    return {
      date,
      label,
      value: summary?.totalScore ?? 0,
      today: date === to,
    };
  });
}
