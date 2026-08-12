// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FocusResetProgram } from "@/components/focus-reset-program";

describe("FocusResetProgram", () => {
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

  it("renders today's protocol, urge interrupter and Day 1 baseline inputs", async () => {
    await act(async () => {
      root.render(createElement(FocusResetProgram, { initialLogs: [], today: "2026-08-12" }));
    });

    expect(container.textContent).toContain("誘惑を消す環境をつくる");
    expect(container.textContent).toContain("YouTubeに逃げたくなった");
    expect(container.textContent).toContain("無目的起動");
    expect(container.textContent).toContain("YouTubeを開く目的");
    expect(container.querySelectorAll(".focus-program-strip button")).toHaveLength(14);
    expect(container.querySelectorAll(".focus-program-strip button:disabled")).toHaveLength(13);
  });
});
