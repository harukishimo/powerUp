import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type ReminderSlot = { id: string; tone: "light" | "yellow" | "alert" } | null;
type Task = { id: string; title: string };

interface GasContext {
  getReminderSlot_(hour: number, minute: number): ReminderSlot;
  getTemplatesForTone_(tone: string): string[];
  findIncompleteTasks_(habits: Record<string, unknown>[], logs: Record<string, unknown>[], date: string, weekday: number, userKey: string): Task[];
  buildReminderMessage_(tone: string, tasks: Task[], randomValue: number, appUrl: string): string;
}

function loadGasContext() {
  const source = readFileSync(new URL("../gas/Code.gs", import.meta.url), "utf8");
  const context = { console } as unknown as GasContext;
  runInNewContext(source, context);
  return context;
}

describe("GAS daily task reminder", () => {
  const gas = loadGasContext();

  it("does not allocate a send slot between midnight and 05:59", () => {
    expect(gas.getReminderSlot_(0, 0)).toBeNull();
    expect(gas.getReminderSlot_(5, 59)).toBeNull();
  });

  it("allocates exactly two light reminder slots between 06:00 and 18:59", () => {
    expect(gas.getReminderSlot_(6, 0)).toEqual({ id: "light-1", tone: "light" });
    expect(gas.getReminderSlot_(12, 29)).toEqual({ id: "light-1", tone: "light" });
    expect(gas.getReminderSlot_(12, 30)).toEqual({ id: "light-2", tone: "light" });
    expect(gas.getReminderSlot_(18, 59)).toEqual({ id: "light-2", tone: "light" });
  });

  it("allocates one yellow slot per hour from 19:00 to 21:59", () => {
    expect(gas.getReminderSlot_(19, 0)).toEqual({ id: "yellow-19", tone: "yellow" });
    expect(gas.getReminderSlot_(19, 59)).toEqual({ id: "yellow-19", tone: "yellow" });
    expect(gas.getReminderSlot_(21, 59)).toEqual({ id: "yellow-21", tone: "yellow" });
  });

  it("allocates two alert slots per hour from 22:00 to 23:59", () => {
    expect(gas.getReminderSlot_(22, 0)).toEqual({ id: "alert-2200", tone: "alert" });
    expect(gas.getReminderSlot_(22, 29)).toEqual({ id: "alert-2200", tone: "alert" });
    expect(gas.getReminderSlot_(22, 30)).toEqual({ id: "alert-2230", tone: "alert" });
    expect(gas.getReminderSlot_(23, 59)).toEqual({ id: "alert-2330", tone: "alert" });
  });

  it("provides five unique message templates for every tone", () => {
    for (const tone of ["light", "yellow", "alert"]) {
      const templates = gas.getTemplatesForTone_(tone);
      expect(templates).toHaveLength(5);
      expect(new Set(templates).size).toBe(5);
    }
  });

  it("extracts only active, scheduled and unfinished tasks for the target user", () => {
    const habits = [
      { habit_id: "daily", user_key: "default", habit_name: "毎日の散歩", target_days: "[0,1,2,3,4,5,6]", active: "true", created_at: "2026-08-01T06:00:00.000+09:00" },
      { habit_id: "done", user_key: "default", habit_name: "水を飲む", target_days: "[3]", active: "true", created_at: "2026-08-01T06:00:00.000+09:00" },
      { habit_id: "other-day", user_key: "default", habit_name: "週末だけ", target_days: "[0,6]", active: "true", created_at: "2026-08-01T06:00:00.000+09:00" },
      { habit_id: "inactive", user_key: "default", habit_name: "休止中", target_days: "[3]", active: "false", created_at: "2026-08-01T06:00:00.000+09:00" },
      { habit_id: "other-user", user_key: "someone", habit_name: "別ユーザー", target_days: "[3]", active: "true", created_at: "2026-08-01T06:00:00.000+09:00" },
    ];
    const logs = [{ habit_id: "done", user_key: "default", log_date: "2026-08-12", completed: "true" }];

    expect(gas.findIncompleteTasks_(habits, logs, "2026-08-12", 3, "default")).toEqual([
      { id: "daily", title: "毎日の散歩" },
    ]);
  });

  it("builds a LINE message containing every unfinished task and optional app URL", () => {
    const message = gas.buildReminderMessage_("alert", [
      { id: "one", title: "daily task Title 1" },
      { id: "two", title: "daily task Title 2" },
    ], 0, "https://powerup.example.com/habits");

    expect(message).toContain("・daily task Title 1");
    expect(message).toContain("・daily task Title 2");
    expect(message).toContain("今日が終わる前にやっちゃいましょう");
    expect(message).toContain("https://powerup.example.com/habits");
  });
});
