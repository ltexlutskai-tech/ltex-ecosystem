import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useCounter } from "./use-counter";

describe("useCounter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("starts at 0 before animation runs", () => {
    const { result } = renderHook(() =>
      useCounter({ target: 1000, startWhenVisible: false, durationMs: 1000 }),
    );
    expect(result.current.value).toBe(0);
  });

  it("returns 0 immediately when target is 0", () => {
    const { result } = renderHook(() =>
      useCounter({ target: 0, startWhenVisible: false }),
    );
    expect(result.current.value).toBe(0);
  });

  it("animates up to the target after duration", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const rafs: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(
      (cb: FrameRequestCallback) => {
        rafs.push(cb);
        return rafs.length;
      },
    );

    const { result } = renderHook(() =>
      useCounter({ target: 100, durationMs: 1000, startWhenVisible: false }),
    );

    // Drain frames until the counter reaches the target.
    await act(async () => {
      for (let i = 0; i < 200 && rafs.length > 0; i++) {
        const next = rafs.shift();
        now += 50;
        next?.(now);
      }
    });

    expect(result.current.value).toBe(100);
  });
});
