import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDiscardWarning } from "./use-discard-warning";

describe("useDiscardWarning", () => {
  it("does not register listener when not dirty", () => {
    const add = vi.spyOn(window, "addEventListener");
    renderHook(() => useDiscardWarning(false));
    expect(add.mock.calls.find((c) => c[0] === "beforeunload")).toBeUndefined();
    add.mockRestore();
  });

  it("registers and removes beforeunload handler when dirty", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useDiscardWarning(true));
    expect(add.mock.calls.some((c) => c[0] === "beforeunload")).toBe(true);
    unmount();
    expect(remove.mock.calls.some((c) => c[0] === "beforeunload")).toBe(true);
    add.mockRestore();
    remove.mockRestore();
  });
});
