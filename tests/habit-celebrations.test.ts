import { describe, expect, it } from "vitest";
import { HABIT_CELEBRATIONS, pickHabitCelebration } from "@/lib/habit-celebrations";

describe("habit celebrations", () => {
  it("provides four unique animations and four unique messages", () => {
    expect(HABIT_CELEBRATIONS).toHaveLength(4);
    expect(new Set(HABIT_CELEBRATIONS.map((item) => item.animation)).size).toBe(4);
    expect(new Set(HABIT_CELEBRATIONS.map((item) => item.message)).size).toBe(4);
  });

  it.each([
    [0, "confetti"],
    [0.25, "sparkles"],
    [0.5, "rings"],
    [0.75, "rising-stars"],
  ] as const)("selects the expected variant for random value %s", (randomValue, animation) => {
    expect(pickHabitCelebration(() => randomValue).animation).toBe(animation);
  });
});
