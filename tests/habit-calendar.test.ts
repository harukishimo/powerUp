// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HabitCalendar } from "@/components/habit-calendar";
import type { Habit, HabitLog } from "@/types/domain";

describe("HabitCalendar", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("shows the monthly completion and today's completed habit", async () => {
    const habit: Habit = {
      id: "habit-water",
      name: "朝に水を飲む",
      note: "起床後に1杯",
      color: "blue",
      targetDays: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      createdAt: "2026-08-03T06:00:00.000+09:00",
      updatedAt: "2026-08-03T06:00:00.000+09:00",
    };
    const log: HabitLog = {
      habitId: habit.id,
      date: "2026-08-03",
      completed: true,
      updatedAt: "2026-08-03T06:10:00.000+09:00",
    };

    await act(async () => {
      root.render(createElement(HabitCalendar, {
        habits: [habit],
        initialLogs: [log],
        initialMonth: "2026-08",
        today: "2026-08-03",
      }));
    });

    expect(container.textContent).toContain("2026年8月");
    expect(container.textContent).toContain("朝に水を飲む");
    expect(container.textContent).toContain("100%");
    expect(container.querySelector(".habit-check.completed")).not.toBeNull();
    expect(container.querySelector(".habit-streak-item")?.textContent).toContain("1");
  });
});
