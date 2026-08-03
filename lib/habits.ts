import { shiftDate } from "@/lib/date";
import type { Habit, HabitLog } from "@/types/domain";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function parts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

export function weekdayOf(date: string) {
  const { year, month, day } = parts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function getMonthBounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("月の形式が正しくありません。");
  const [year, monthNumber] = month.split("-").map(Number);
  if (monthNumber < 1 || monthNumber > 12) throw new Error("月の形式が正しくありません。");
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { start, end: `${year}-${String(monthNumber).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}` };
}

export function shiftMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const value = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildMonthCalendar(month: string) {
  const { start, end } = getMonthBounds(month);
  const mondayOffset = (weekdayOf(start) + 6) % 7;
  const daysInMonth = Number(end.slice(-2));
  const cellCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
  const gridStart = shiftDate(start, -mondayOffset);
  return Array.from({ length: cellCount }, (_, index) => {
    const date = shiftDate(gridStart, index);
    return { date, inMonth: date.startsWith(month) };
  });
}

export function isHabitScheduled(habit: Habit, date: string) {
  return habit.active && date >= habit.createdAt.slice(0, 10) && habit.targetDays.includes(weekdayOf(date));
}

export function formatTargetDays(days: number[]) {
  if (days.length === 7) return "毎日";
  if (days.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day))) return "平日";
  if (days.length === 2 && days.includes(0) && days.includes(6)) return "土日";
  return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((day) => DAY_LABELS[day]).join("・");
}

export function calculateHabitStreak(habit: Habit, logs: HabitLog[], throughDate: string) {
  const firstDate = habit.createdAt.slice(0, 10);
  if (firstDate > throughDate) return { current: 0, longest: 0 };
  const completed = new Set(
    logs.filter((log) => log.habitId === habit.id && log.completed && log.date <= throughDate).map((log) => log.date),
  );
  const scheduledDates: string[] = [];
  for (let date = firstDate; date <= throughDate; date = shiftDate(date, 1)) {
    if (habit.targetDays.includes(weekdayOf(date))) scheduledDates.push(date);
  }

  let longest = 0;
  let running = 0;
  for (const date of scheduledDates) {
    if (completed.has(date)) {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }

  const datesForCurrent = [...scheduledDates];
  const latest = datesForCurrent.at(-1);
  // 当日の未達成は、1日が終わるまでは連続記録を切らない。
  if (latest === throughDate && !completed.has(latest)) datesForCurrent.pop();
  let current = 0;
  for (let index = datesForCurrent.length - 1; index >= 0; index -= 1) {
    if (!completed.has(datesForCurrent[index])) break;
    current += 1;
  }
  return { current, longest };
}
