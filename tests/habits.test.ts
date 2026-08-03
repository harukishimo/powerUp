import { describe, expect, it } from "vitest";
import { buildMonthCalendar, calculateHabitStreak, formatTargetDays, getMonthBounds, isHabitScheduled } from "@/lib/habits";
import type { Habit, HabitLog } from "@/types/domain";

const habit: Habit = {
  id: "habit-walk",
  name: "朝に散歩する",
  note: "",
  color: "mint",
  targetDays: [1, 2, 3, 4, 5],
  active: true,
  createdAt: "2026-07-27T08:00:00.000+09:00",
  updatedAt: "2026-07-27T08:00:00.000+09:00",
};

function completed(date: string): HabitLog {
  return { habitId: habit.id, date, completed: true, updatedAt: `${date}T08:00:00.000+09:00` };
}

describe("habit calendar", () => {
  it("builds a Monday-first calendar containing every date in the month", () => {
    const cells = buildMonthCalendar("2026-08");
    expect(cells.length).toBe(42);
    expect(cells[0].date).toBe("2026-07-27");
    expect(cells.at(-1)?.date).toBe("2026-09-06");
    expect(getMonthBounds("2026-08")).toEqual({ start: "2026-08-01", end: "2026-08-31" });
  });

  it("only schedules selected weekdays after the habit was created", () => {
    expect(isHabitScheduled(habit, "2026-07-26")).toBe(false);
    expect(isHabitScheduled(habit, "2026-07-27")).toBe(true);
    expect(isHabitScheduled(habit, "2026-08-01")).toBe(false);
    expect(formatTargetDays(habit.targetDays)).toBe("平日");
  });

  it("keeps the current streak during an unfinished target day", () => {
    const logs = [completed("2026-07-27"), completed("2026-07-28"), completed("2026-07-29")];
    expect(calculateHabitStreak(habit, logs, "2026-07-30")).toEqual({ current: 3, longest: 3 });
    expect(calculateHabitStreak(habit, logs, "2026-07-31")).toEqual({ current: 0, longest: 3 });
  });

  it("does not break a streak on days outside the target schedule", () => {
    const logs = [
      completed("2026-07-30"),
      completed("2026-07-31"),
      completed("2026-08-03"),
    ];
    expect(calculateHabitStreak(habit, logs, "2026-08-03")).toEqual({ current: 3, longest: 3 });
  });
});
