// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LogReview } from "@/components/log-review";
import { createBlankLog } from "@/lib/demo-data";
import type { DailyLog, DailyLogSummary } from "@/types/domain";

describe("LogReview", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("reflects a saved current-day log when parent props change without remounting", async () => {
    const initialLog = createBlankLog("2026-07-31");

    await act(async () => {
      root.render(createElement(LogReview, {
        summaries: [],
        initialLog,
      }));
    });

    expect(container.querySelector(".day-button .day-score")?.textContent?.trim()).toBe("未記録");
    expect(container.querySelector(".detail-timeline")?.textContent).toContain("まだイベントがありません");

    const updatedLog: DailyLog = {
      ...initialLog,
      sleep: { pixelWatchScore: 85, recoveryFeeling: 3 },
      scores: { ...initialLog.scores, sleep: 24 },
      timeline: [{ time: "09:11", label: "日次ログを保存", detail: "web-request" }],
    };
    const summaries: DailyLogSummary[] = [{
      date: updatedLog.date,
      totalScore: null,
      recordingRate: 0,
      scores: { sleep: 24, food: null, phone: null, result: null },
      status: "draft",
    }];

    await act(async () => {
      root.render(createElement(LogReview, {
        summaries,
        initialLog: updatedLog,
      }));
    });

    expect(container.querySelector(".day-button .day-score")?.textContent?.trim()).toBe("記録あり");
    expect(container.querySelector(".detail-grid")?.textContent).toContain("24 / 30");
    expect(container.querySelector(".detail-timeline")?.textContent).toContain("09:11");
    expect(container.querySelector(".detail-timeline")?.textContent).toContain("web-request");
  });
});
