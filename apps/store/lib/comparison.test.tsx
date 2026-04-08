import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  ComparisonProvider,
  useComparison,
  type ComparisonItem,
} from "./comparison";

const createItem = (id: string): ComparisonItem => ({
  productId: id,
  slug: `product-${id}`,
  name: `Product ${id}`,
  quality: "first",
  season: "summer",
  priceUnit: "kg",
  country: "england",
  imageUrl: null,
  priceEur: 5.0,
});

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useComparison", () => {
  it("throws when used outside provider", () => {
    expect(() => renderHook(() => useComparison())).toThrow(
      "useComparison must be used within ComparisonProvider",
    );
  });

  it("starts with empty items", () => {
    const { result } = renderHook(() => useComparison(), {
      wrapper: ComparisonProvider,
    });
    expect(result.current.items).toEqual([]);
    expect(result.current.itemCount).toBe(0);
  });

  it("adds items", () => {
    const { result } = renderHook(() => useComparison(), {
      wrapper: ComparisonProvider,
    });

    act(() => result.current.addItem(createItem("1")));
    act(() => result.current.addItem(createItem("2")));

    expect(result.current.items).toHaveLength(2);
    expect(result.current.itemCount).toBe(2);
  });

  it("does not add more than 3 items (MAX_ITEMS)", () => {
    const { result } = renderHook(() => useComparison(), {
      wrapper: ComparisonProvider,
    });

    act(() => result.current.addItem(createItem("1")));
    act(() => result.current.addItem(createItem("2")));
    act(() => result.current.addItem(createItem("3")));
    act(() => result.current.addItem(createItem("4")));

    expect(result.current.items).toHaveLength(3);
    expect(result.current.items.map((i) => i.productId)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("does not add duplicates", () => {
    const { result } = renderHook(() => useComparison(), {
      wrapper: ComparisonProvider,
    });

    act(() => result.current.addItem(createItem("1")));
    act(() => result.current.addItem(createItem("1")));

    expect(result.current.items).toHaveLength(1);
  });

  it("removes items", () => {
    const { result } = renderHook(() => useComparison(), {
      wrapper: ComparisonProvider,
    });

    act(() => result.current.addItem(createItem("1")));
    act(() => result.current.addItem(createItem("2")));
    act(() => result.current.removeItem("1"));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]!.productId).toBe("2");
  });

  it("checks if item is in comparison", () => {
    const { result } = renderHook(() => useComparison(), {
      wrapper: ComparisonProvider,
    });

    act(() => result.current.addItem(createItem("1")));

    expect(result.current.isInComparison("1")).toBe(true);
    expect(result.current.isInComparison("2")).toBe(false);
  });

  it("clears all items", () => {
    const { result } = renderHook(() => useComparison(), {
      wrapper: ComparisonProvider,
    });

    act(() => result.current.addItem(createItem("1")));
    act(() => result.current.addItem(createItem("2")));
    act(() => result.current.clearAll());

    expect(result.current.items).toHaveLength(0);
    expect(result.current.itemCount).toBe(0);
  });

  it("persists to localStorage", () => {
    const { result } = renderHook(() => useComparison(), {
      wrapper: ComparisonProvider,
    });

    act(() => result.current.addItem(createItem("1")));

    const stored = JSON.parse(localStorage.getItem("ltex-comparison") ?? "[]");
    expect(stored).toHaveLength(1);
  });
});
