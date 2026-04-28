import React, { useCallback, useEffect, useRef, useState } from "react";
import { WishlistContext } from "./wishlist";
import { favoritesApi, type WebCatalogProduct } from "./api";
import { useAuth } from "./auth";

let SecureStore: typeof import("expo-secure-store") | null = null;
try {
  SecureStore = require("expo-secure-store");
} catch {
  // Web fallback
}

const STORAGE_KEY = "ltex_wishlist_v1";
// SecureStore on iOS has a soft per-item size limit; cap items so a power
// user does not blow past it. ~150 bytes per snapshot * 100 = ~15KB.
const MAX_ITEMS = 100;

interface StoredShape {
  version: 1;
  items: WebCatalogProduct[];
}

async function loadFromStorage(): Promise<WebCatalogProduct[]> {
  try {
    let raw: string | null = null;
    if (SecureStore) {
      raw = await SecureStore.getItemAsync(STORAGE_KEY);
    } else if (typeof window !== "undefined") {
      raw = localStorage.getItem(STORAGE_KEY);
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoredShape>;
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) return [];
    return parsed.items;
  } catch {
    return [];
  }
}

async function saveToStorage(items: WebCatalogProduct[]): Promise<void> {
  try {
    const payload: StoredShape = { version: 1, items };
    const raw = JSON.stringify(payload);
    if (SecureStore) {
      await SecureStore.setItemAsync(STORAGE_KEY, raw);
    } else if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, raw);
    }
  } catch {}
}

/**
 * Trim a full WebCatalogProduct to the smallest snapshot that still renders
 * a ProductCard. We drop heavy fields like full image arrays (keep only the
 * first image) and only the wholesale price.
 */
function snapshot(product: WebCatalogProduct): WebCatalogProduct {
  const wholesale = product.prices.find((p) => p.priceType === "wholesale");
  const sale = product.prices.find((p) => p.priceType === "akciya");
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    quality: product.quality,
    season: product.season,
    priceUnit: product.priceUnit,
    country: product.country,
    videoUrl: product.videoUrl,
    images: product.images.slice(0, 1),
    _count: { lots: product._count?.lots ?? 0 },
    prices: [wholesale, sale].filter((p): p is NonNullable<typeof p> =>
      Boolean(p),
    ),
    createdAt: product.createdAt ?? null,
  };
}

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<WebCatalogProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { customerId } = useAuth();
  // Track the latest array for the saver effect without re-running it on
  // every keystroke equivalent. We still call saveToStorage on every change.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  // Remember the customerId we last pulled+merged so re-renders don't
  // re-trigger another sync.
  const lastSyncedCustomerIdRef = useRef<string | null>(null);

  // Initial load from disk.
  useEffect(() => {
    loadFromStorage().then((stored) => {
      setItems(stored);
      setIsLoading(false);
    });
  }, []);

  // Persist whenever items change (after initial load).
  useEffect(() => {
    if (isLoading) return;
    saveToStorage(items);
  }, [items, isLoading]);

  // On login, pull the server wishlist and merge with the local one.
  // Server-win on conflict (productId); local-only items are preserved.
  useEffect(() => {
    if (isLoading) return;
    if (!customerId) {
      lastSyncedCustomerIdRef.current = null;
      return;
    }
    if (lastSyncedCustomerIdRef.current === customerId) return;

    (async () => {
      try {
        const { favorites } = await favoritesApi.list();
        const serverProducts = favorites.map((f) => snapshot(f.product));
        const serverIds = new Set(serverProducts.map((p) => p.id));
        const localOnly = itemsRef.current.filter((i) => !serverIds.has(i.id));
        const merged = [...serverProducts, ...localOnly].slice(0, MAX_ITEMS);
        setItems(merged);
        lastSyncedCustomerIdRef.current = customerId;
      } catch {
        // Network/parse error — silent. Local wishlist is unchanged.
      }
    })();
  }, [customerId, isLoading]);

  const has = useCallback(
    (productId: string) => items.some((p) => p.id === productId),
    [items],
  );

  const toggle = useCallback(
    (product: WebCatalogProduct) => {
      const isCurrentlyIn = itemsRef.current.some((p) => p.id === product.id);
      if (isCurrentlyIn) {
        setItems((prev) => prev.filter((p) => p.id !== product.id));
        if (customerId) {
          favoritesApi.remove(product.id).catch(() => {});
        }
      } else {
        const snap = snapshot(product);
        setItems((prev) => [snap, ...prev].slice(0, MAX_ITEMS));
        if (customerId) {
          favoritesApi.add(product.id).catch(() => {});
        }
      }
    },
    [customerId],
  );

  return (
    <WishlistContext.Provider value={{ items, has, toggle, isLoading }}>
      {children}
    </WishlistContext.Provider>
  );
}
