"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useCustomer } from "@/lib/customer-context";

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
  const customer = useCustomer();
  const lastSyncedCustomerIdRef = useRef<string | null>(null);

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

  // Sync local product favorites with the authenticated customer once per
  // session per customerId. Lot favorites stay local-only — there is no
  // server-side schema for them yet (S73 keeps the lot wishlist client-only).
  useEffect(() => {
    if (!loaded) return;
    if (!customer) {
      lastSyncedCustomerIdRef.current = null;
      return;
    }
    if (lastSyncedCustomerIdRef.current === customer.id) return;
    lastSyncedCustomerIdRef.current = customer.id;

    let cancelled = false;
    (async () => {
      const productItems = items.filter((i) => i.kind === "product");
      try {
        const res = await fetch("/api/customer/favorites/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: productItems.map((i) => ({ productId: i.productId })),
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          items?: { productId: string }[];
        };
        if (cancelled || !Array.isArray(data.items)) return;

        const serverIds = new Set(data.items.map((i) => i.productId));
        const localById = new Map(
          items
            .filter((i) => i.kind === "product")
            .map((i) => [i.productId, i] as const),
        );
        const lotItems = items.filter((i) => i.kind === "lot");
        const mergedProducts: WishlistItem[] = Array.from(serverIds).map(
          (id) =>
            localById.get(id) ?? {
              kind: "product",
              productId: id,
              slug: "",
              name: "",
              quality: "",
              imageUrl: null,
              priceEur: null,
              priceUnit: "kg",
            },
        );
        // Drop placeholders (slug === "") — those are server entries we have
        // no metadata for; rendering them would 404. They'll re-populate the
        // next time the customer hovers over the product.
        const nextItems = [
          ...mergedProducts.filter((i) => i.slug !== ""),
          ...lotItems,
        ];
        setItems(nextItems);
      } catch {
        // Network failure: keep local state, retry on next mount.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [customer, loaded, items]);

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
