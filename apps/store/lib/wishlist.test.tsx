import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  WishlistProvider,
  useWishlist,
  wishlistItemKey,
  type WishlistItem,
} from "./wishlist";

const mockItem: WishlistItem = {
  kind: "product",
  productId: "p1",
  slug: "test-product",
  name: "Test Product",
  quality: "first",
  imageUrl: null,
  priceEur: 5.0,
  priceUnit: "kg",
};

const mockItem2: WishlistItem = {
  kind: "product",
  productId: "p2",
  slug: "test-product-2",
  name: "Test Product 2",
  quality: "stock",
  imageUrl: null,
  priceEur: 10.0,
  priceUnit: "piece",
};

const mockLot: WishlistItem = {
  kind: "lot",
  productId: "p1",
  slug: "test-product",
  name: "Test Product",
  quality: "first",
  imageUrl: null,
  priceEur: 235.62,
  priceUnit: "kg",
  lotId: "lot-1",
  barcode: "2000153074116",
  weight: 15.3,
  quantity: 42,
  videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
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
    expect(result.current.items[0]!.productId).toBe("p1");
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

  it("removes an item by unified key", () => {
    const { result } = renderHook(() => useWishlist(), {
      wrapper: WishlistProvider,
    });

    act(() => result.current.addItem(mockItem));
    act(() => result.current.addItem(mockItem2));
    act(() => result.current.removeItem(wishlistItemKey(mockItem)));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]!.productId).toBe("p2");
  });

  it("checks if item is in wishlist via unified key", () => {
    const { result } = renderHook(() => useWishlist(), {
      wrapper: WishlistProvider,
    });

    expect(result.current.isInWishlist("product-p1")).toBe(false);

    act(() => result.current.addItem(mockItem));

    expect(result.current.isInWishlist("product-p1")).toBe(true);
    expect(result.current.isInWishlist("product-p2")).toBe(false);
  });

  it("hasProduct helper differentiates from lots with same productId", () => {
    const { result } = renderHook(() => useWishlist(), {
      wrapper: WishlistProvider,
    });

    act(() => result.current.addItem(mockLot));

    // a lot was saved that wraps p1, but no product entry exists
    expect(result.current.hasProduct("p1")).toBe(false);
    expect(result.current.hasLot("lot-1")).toBe(true);

    act(() => result.current.addItem(mockItem));
    expect(result.current.hasProduct("p1")).toBe(true);
  });

  it("addItem + removeItem flow for lots", () => {
    const { result } = renderHook(() => useWishlist(), {
      wrapper: WishlistProvider,
    });

    act(() => result.current.addItem(mockLot));
    expect(result.current.hasLot("lot-1")).toBe(true);
    expect(result.current.itemCount).toBe(1);

    act(() => result.current.removeItem(wishlistItemKey(mockLot)));
    expect(result.current.hasLot("lot-1")).toBe(false);
    expect(result.current.itemCount).toBe(0);
  });

  it("hasLot returns false for unknown lotId", () => {
    const { result } = renderHook(() => useWishlist(), {
      wrapper: WishlistProvider,
    });
    act(() => result.current.addItem(mockLot));
    expect(result.current.hasLot("lot-999")).toBe(false);
  });

  it("persists items to localStorage", () => {
    const { result } = renderHook(() => useWishlist(), {
      wrapper: WishlistProvider,
    });

    act(() => result.current.addItem(mockItem));

    const stored = JSON.parse(localStorage.getItem("ltex-wishlist") ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].productId).toBe("p1");
    expect(stored[0].kind).toBe("product");
  });

  it("normalizes legacy localStorage entries (no kind) as products", () => {
    // Legacy schema had no `kind` field — must default to "product".
    const legacy = [
      {
        productId: "p-legacy",
        slug: "legacy-slug",
        name: "Legacy Product",
        quality: "first",
        imageUrl: null,
        priceEur: 7,
        priceUnit: "kg",
      },
    ];
    localStorage.setItem("ltex-wishlist", JSON.stringify(legacy));

    const { result } = renderHook(() => useWishlist(), {
      wrapper: WishlistProvider,
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]!.kind).toBe("product");
    expect(result.current.hasProduct("p-legacy")).toBe(true);
  });

  it("wishlistItemKey produces lot-{id} for lots and product-{id} for products", () => {
    expect(wishlistItemKey(mockItem)).toBe("product-p1");
    expect(wishlistItemKey(mockLot)).toBe("lot-lot-1");
  });
});
