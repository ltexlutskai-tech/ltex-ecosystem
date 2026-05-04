"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type WishlistKind = "product" | "lot";

export interface WishlistItem {
  kind: WishlistKind;
  productId: string;
  slug: string;
  name: string;
  quality: string;
  imageUrl: string | null;
  priceEur: number | null;
  priceUnit: string;
  // only when kind === "lot"
  lotId?: string;
  barcode?: string;
  weight?: number;
  quantity?: number;
  videoUrl?: string | null;
}

interface WishlistContextType {
  items: WishlistItem[];
  addItem: (item: WishlistItem) => void;
  /** Accepts the unified key produced by `wishlistItemKey`. */
  removeItem: (key: string) => void;
  /** Accepts the unified key produced by `wishlistItemKey`. */
  isInWishlist: (key: string) => boolean;
  hasProduct: (productId: string) => boolean;
  hasLot: (lotId: string) => boolean;
  itemCount: number;
}

const WishlistContext = createContext<WishlistContextType | null>(null);

const STORAGE_KEY = "ltex-wishlist";

export function wishlistItemKey(item: WishlistItem): string {
  return item.kind === "lot" && item.lotId
    ? `lot-${item.lotId}`
    : `product-${item.productId}`;
}

function normalizeItem(raw: unknown): WishlistItem | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<WishlistItem> & { kind?: WishlistKind };
  // Backward-compat: legacy items written before S63 have no `kind` —
  // they were always products.
  const kind: WishlistKind = candidate.kind === "lot" ? "lot" : "product";
  if (
    typeof candidate.productId !== "string" ||
    typeof candidate.slug !== "string" ||
    typeof candidate.name !== "string"
  ) {
    return null;
  }
  return {
    kind,
    productId: candidate.productId,
    slug: candidate.slug,
    name: candidate.name,
    quality: candidate.quality ?? "",
    imageUrl: candidate.imageUrl ?? null,
    priceEur: candidate.priceEur ?? null,
    priceUnit: candidate.priceUnit ?? "kg",
    lotId: candidate.lotId,
    barcode: candidate.barcode,
    weight: candidate.weight,
    quantity: candidate.quantity,
    videoUrl: candidate.videoUrl ?? null,
  };
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .map(normalizeItem)
            .filter((i): i is WishlistItem => i !== null);
          setItems(normalized);
        }
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items, loaded]);

  const addItem = useCallback((item: WishlistItem) => {
    setItems((prev) => {
      const key = wishlistItemKey(item);
      if (prev.some((i) => wishlistItemKey(i) === key)) return prev;
      return [...prev, item];
    });
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => wishlistItemKey(i) !== key));
  }, []);

  const isInWishlist = useCallback(
    (key: string) => items.some((i) => wishlistItemKey(i) === key),
    [items],
  );

  const hasProduct = useCallback(
    (productId: string) =>
      items.some((i) => i.kind === "product" && i.productId === productId),
    [items],
  );

  const hasLot = useCallback(
    (lotId: string) => items.some((i) => i.kind === "lot" && i.lotId === lotId),
    [items],
  );

  return (
    <WishlistContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        isInWishlist,
        hasProduct,
        hasLot,
        itemCount: items.length,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within WishlistProvider");
  return ctx;
}
