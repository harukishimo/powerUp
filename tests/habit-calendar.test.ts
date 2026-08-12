// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
    expect(container.querySelector(".habit-inline-streak")?.textContent).toContain("1回連続");
    expect(container.querySelector(".habit-inline-streak")?.textContent).toContain("最長 1回");
  });

  it("celebrates only after a task is successfully completed", async () => {
    const habit: Habit = {
      id: "habit-stretch",
      name: "朝にストレッチする",
      note: "",
      color: "mint",
      targetDays: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      createdAt: "2026-08-03T06:00:00.000+09:00",
      updatedAt: "2026-08-03T06:00:00.000+09:00",
    };
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      log: {
        habitId: habit.id,
        date: "2026-08-03",
        completed: true,
        updatedAt: "2026-08-03T07:00:00.000+09:00",
      },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await act(async () => {
      root.render(createElement(HabitCalendar, {
        habits: [habit],
        initialLogs: [],
        initialMonth: "2026-08",
        today: "2026-08-03",
      }));
    });
    const checkButton = container.querySelector<HTMLButtonElement>(".habit-check");
    expect(checkButton).not.toBeNull();

    await act(async () => {
      checkButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const celebration = container.querySelector(".habit-celebration-rings");
    expect(celebration).not.toBeNull();
    expect(celebration?.textContent).toContain("ナイス達成！未来の自分に一歩前進です。");
    expect(celebration?.textContent).toContain(habit.name);
    expect(container.querySelector(".habit-inline-streak")?.textContent).toContain("1回連続");
  });

  it("does not celebrate when a completed task is unchecked", async () => {
    const habit: Habit = {
      id: "habit-reading",
      name: "本を読む",
      note: "",
      color: "violet",
      targetDays: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      createdAt: "2026-08-03T06:00:00.000+09:00",
      updatedAt: "2026-08-03T06:00:00.000+09:00",
    };
    const completedLog: HabitLog = {
      habitId: habit.id,
      date: "2026-08-03",
      completed: true,
      updatedAt: "2026-08-03T06:30:00.000+09:00",
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      log: { ...completedLog, completed: false, updatedAt: "2026-08-03T07:00:00.000+09:00" },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await act(async () => {
      root.render(createElement(HabitCalendar, {
        habits: [habit],
        initialLogs: [completedLog],
        initialMonth: "2026-08",
        today: "2026-08-03",
      }));
    });
    const checkButton = container.querySelector<HTMLButtonElement>(".habit-check");

    await act(async () => {
      checkButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(container.querySelector(".habit-celebration")).toBeNull();
  });
});
