import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  RecentlyViewedProvider,
  useRecentlyViewed,
} from "./recently-viewed";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useRecentlyViewed", () => {
  it("throws when used outside provider", () => {
    expect(() => renderHook(() => useRecentlyViewed())).toThrow(
      "useRecentlyViewed must be used within RecentlyViewedProvider",
    );
  });

  it("starts with empty items", () => {
    const { result } = renderHook(() => useRecentlyViewed(), {
      wrapper: RecentlyViewedProvider,
    });
    expect(result.current.items).toEqual([]);
  });

  it("adds an item with viewedAt timestamp", () => {
    const { result } = renderHook(() => useRecentlyViewed(), {
      wrapper: RecentlyViewedProvider,
    });

    act(() =>
      result.current.addItem({
        slug: "product-1",
        name: "Product 1",
        quality: "first",
        imageUrl: null,
        priceEur: 5.0,
        priceUnit: "kg",
      }),
    );

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].slug).toBe("product-1");
    expect(result.current.items[0].viewedAt).toBeGreaterThan(0);
  });

  it("moves re-viewed item to front", () => {
    const { result } = renderHook(() => useRecentlyViewed(), {
      wrapper: RecentlyViewedProvider,
    });

    act(() =>
      result.current.addItem({
        slug: "product-1",
        name: "Product 1",
        quality: "first",
        imageUrl: null,
        priceEur: 5.0,
        priceUnit: "kg",
      }),
    );
    act(() =>
      result.current.addItem({
        slug: "product-2",
        name: "Product 2",
        quality: "stock",
        imageUrl: null,
        priceEur: 8.0,
        priceUnit: "kg",
      }),
    );
    act(() =>
      result.current.addItem({
        slug: "product-1",
        name: "Product 1",
        quality: "first",
        imageUrl: null,
        priceEur: 5.0,
        priceUnit: "kg",
      }),
    );

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].slug).toBe("product-1");
    expect(result.current.items[1].slug).toBe("product-2");
  });

  it("limits to MAX_ITEMS (12)", () => {
    const { result } = renderHook(() => useRecentlyViewed(), {
      wrapper: RecentlyViewedProvider,
    });

    for (let i = 0; i < 15; i++) {
      act(() =>
        result.current.addItem({
          slug: `product-${i}`,
          name: `Product ${i}`,
          quality: "first",
          imageUrl: null,
          priceEur: 5.0,
          priceUnit: "kg",
        }),
      );
    }

    expect(result.current.items).toHaveLength(12);
    // Most recent should be first
    expect(result.current.items[0].slug).toBe("product-14");
  });

  it("persists to localStorage", () => {
    const { result } = renderHook(() => useRecentlyViewed(), {
      wrapper: RecentlyViewedProvider,
    });

    act(() =>
      result.current.addItem({
        slug: "product-1",
        name: "Product 1",
        quality: "first",
        imageUrl: null,
        priceEur: 5.0,
        priceUnit: "kg",
      }),
    );

    const stored = JSON.parse(
      localStorage.getItem("ltex-recently-viewed") ?? "[]",
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].slug).toBe("product-1");
  });
});
