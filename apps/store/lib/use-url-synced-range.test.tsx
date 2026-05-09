import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUrlSyncedRange } from "./use-url-synced-range";

const pushMock = vi.fn();
let currentSearch = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/catalog",
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

beforeEach(() => {
  pushMock.mockReset();
  currentSearch = "";
});

describe("useUrlSyncedRange", () => {
  it("initializes from bounds when URL has no min/max", () => {
    const { result } = renderHook(() =>
      useUrlSyncedRange({
        paramMin: "priceMin",
        paramMax: "priceMax",
        bounds: [0, 100],
      }),
    );
    expect(result.current.value).toEqual([0, 100]);
  });

  it("initializes from URL when min/max are present", () => {
    currentSearch = "priceMin=10&priceMax=80";
    const { result } = renderHook(() =>
      useUrlSyncedRange({
        paramMin: "priceMin",
        paramMax: "priceMax",
        bounds: [0, 100],
      }),
    );
    expect(result.current.value).toEqual([10, 80]);
  });

  it("commit() pushes URL with non-default values and clears resetParams", () => {
    currentSearch = "page=3";
    const { result } = renderHook(() =>
      useUrlSyncedRange({
        paramMin: "priceMin",
        paramMax: "priceMax",
        bounds: [0, 100],
        resetParams: ["page"],
      }),
    );
    act(() => result.current.commit([20, 50]));
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0]![0]).toBe("/catalog?priceMin=20&priceMax=50");
  });

  it("commit() omits min/max from URL when value equals bounds", () => {
    const { result } = renderHook(() =>
      useUrlSyncedRange({
        paramMin: "priceMin",
        paramMax: "priceMax",
        bounds: [0, 100],
      }),
    );
    act(() => result.current.commit([0, 100]));
    expect(pushMock.mock.calls[0]![0]).toBe("/catalog?");
  });

  it("commit() invokes onApply callback after push", () => {
    const onApply = vi.fn();
    const { result } = renderHook(() =>
      useUrlSyncedRange({
        paramMin: "priceMin",
        paramMax: "priceMax",
        bounds: [0, 100],
        onApply,
      }),
    );
    act(() => result.current.commit([10, 90]));
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});
