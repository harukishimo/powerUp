import { describe, expect, it } from "vitest";
import {
  createBlankFocusLog,
  FOCUS_ENVIRONMENT_CHECKS,
  FOCUS_PROGRAM,
  FOCUS_PROGRAM_END,
  FOCUS_PROGRAM_START,
  getFocusProgramDay,
  isFocusDayComplete,
  metricReduction,
} from "@/lib/focus-program";

describe("focus reset program", () => {
  it("defines the complete 14-day program from August 12 to August 25", () => {
    expect(FOCUS_PROGRAM).toHaveLength(14);
    expect(FOCUS_PROGRAM_START).toBe("2026-08-12");
    expect(FOCUS_PROGRAM_END).toBe("2026-08-25");
    expect(FOCUS_PROGRAM.map((day) => day.day)).toEqual(Array.from({ length: 14 }, (_, index) => index + 1));
    expect(FOCUS_PROGRAM.every((day) => day.actions.length >= 3)).toBe(true);
  });

  it("contains all twelve PC environment safeguards", () => {
    expect(FOCUS_ENVIRONMENT_CHECKS).toHaveLength(12);
    expect(FOCUS_ENVIRONMENT_CHECKS.map((item) => item.id)).toContain("shorts");
    expect(FOCUS_ENVIRONMENT_CHECKS.map((item) => item.id)).toContain("stayfocusd");
    expect(FOCUS_ENVIRONMENT_CHECKS.map((item) => item.id)).toContain("separate-profile");
  });

  it("marks a day complete only after every action is checked", () => {
    const day = getFocusProgramDay("2026-08-14")!;
    const draft = createBlankFocusLog(day.date);
    expect(isFocusDayComplete(draft, day)).toBe(false);
    expect(isFocusDayComplete({ ...draft, completedActionIds: day.actions.map((action) => action.id) }, day)).toBe(true);
  });

  it("compares current metrics with Day 1 without manufacturing a percentage from zero", () => {
    expect(metricReduction(10, 5)).toBe(50);
    expect(metricReduction(10, 12)).toBe(-20);
    expect(metricReduction(0, 0)).toBeNull();
    expect(metricReduction(null, 5)).toBeNull();
  });
});
