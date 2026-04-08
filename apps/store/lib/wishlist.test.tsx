import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { WishlistProvider, useWishlist, type WishlistItem } from "./wishlist";

const mockItem: WishlistItem = {
  productId: "p1",
  slug: "test-product",
  name: "Test Product",
  quality: "first",
  imageUrl: null,
  priceEur: 5.0,
  priceUnit: "kg",
};

const mockItem2: WishlistItem = {
  productId: "p2",
  slug: "test-product-2",
  name: "Test Product 2",
  quality: "stock",
  imageUrl: null,
  priceEur: 10.0,
  priceUnit: "piece",
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useWishlist", () => {
  it("throws when used outside provider", () => {
    expect(() => renderHook(() => useWishlist())).toThrow(
      "useWishlist must be used within WishlistProvider",
    );
  });

  it("starts with empty items", () => {
    const { result } = renderHook(() => useWishlist(), {
      wrapper: WishlistProvider,
    });
    expect(result.current.items).toEqual([]);
    expect(result.current.itemCount).toBe(0);
  });

  it("adds an item", () => {
    const { result } = renderHook(() => useWishlist(), {
      wrapper: WishlistProvider,
    });

    act(() => result.current.addItem(mockItem));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].productId).toBe("p1");
    expect(result.current.itemCount).toBe(1);
  });

  it("does not add duplicate items", () => {
    const { result } = renderHook(() => useWishlist(), {
      wrapper: WishlistProvider,
    });

    act(() => result.current.addItem(mockItem));
    act(() => result.current.addItem(mockItem));

    expect(result.current.items).toHaveLength(1);
  });

  it("removes an item", () => {
    const { result } = renderHook(() => useWishlist(), {
      wrapper: WishlistProvider,
    });

    act(() => result.current.addItem(mockItem));
    act(() => result.current.addItem(mockItem2));
    act(() => result.current.removeItem("p1"));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].productId).toBe("p2");
  });

  it("checks if item is in wishlist", () => {
    const { result } = renderHook(() => useWishlist(), {
      wrapper: WishlistProvider,
    });

    expect(result.current.isInWishlist("p1")).toBe(false);

    act(() => result.current.addItem(mockItem));

    expect(result.current.isInWishlist("p1")).toBe(true);
    expect(result.current.isInWishlist("p2")).toBe(false);
  });

  it("persists items to localStorage", () => {
    const { result } = renderHook(() => useWishlist(), {
      wrapper: WishlistProvider,
    });

    act(() => result.current.addItem(mockItem));

    const stored = JSON.parse(localStorage.getItem("ltex-wishlist") ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].productId).toBe("p1");
  });
});
