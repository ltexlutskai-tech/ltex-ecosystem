/**
 * Locally persisted "recently viewed products" feed for the mobile client.
 *
 * Storage is `expo-secure-store` (RN has no localStorage). Items are stored
 * as a JSON array of `{ product, viewedAt }`, capped at MAX_ITEMS, MRU-first.
 *
 * The hook re-reads on screen focus so screens that share the feed (e.g.
 * HomeScreen showing the rail and ProductScreen pushing new entries) stay in
 * sync without a Provider.
 */

import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import type { WebCatalogProduct } from "./api";

let SecureStore: typeof import("expo-secure-store") | null = null;
try {
  SecureStore = require("expo-secure-store");
} catch {
  // Web fallback handled below via localStorage.
}

const STORAGE_KEY = "mobile.recently_viewed_v1";
const MAX_ITEMS = 12;

interface StoredItem {
  product: WebCatalogProduct;
  viewedAt: number;
}

async function loadFromStorage(): Promise<StoredItem[]> {
  try {
    let raw: string | null = null;
    if (SecureStore) {
      raw = await SecureStore.getItemAsync(STORAGE_KEY);
    } else if (typeof window !== "undefined") {
      raw = window.localStorage.getItem(STORAGE_KEY);
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is StoredItem =>
        i &&
        typeof i.viewedAt === "number" &&
        i.product &&
        typeof i.product.id === "string",
    );
  } catch {
    return [];
  }
}

async function saveToStorage(items: StoredItem[]): Promise<void> {
  try {
    const raw = JSON.stringify(items);
    if (SecureStore) {
      await SecureStore.setItemAsync(STORAGE_KEY, raw);
    } else if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, raw);
    }
  } catch {
    // Best-effort: swallow write errors.
  }
}

/**
 * Trim a full WebCatalogProduct to the smallest snapshot that still renders
 * a ProductCard. Mirrors the wishlist snapshot pattern.
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

export function useRecentlyViewed() {
  const [items, setItems] = useState<StoredItem[]>([]);

  // Initial load.
  useEffect(() => {
    loadFromStorage().then(setItems);
  }, []);

  // Re-load whenever the host screen regains focus so a new item pushed from
  // ProductScreen surfaces in the rail without an app restart.
  useFocusEffect(
    useCallback(() => {
      loadFromStorage().then(setItems);
    }, []),
  );

  // addItem reads from storage (not local state) so a fast-mount call from
  // ProductScreen — fired before the initial load resolves — does not
  // overwrite the stored list with just the new entry.
  const addItem = useCallback(async (product: WebCatalogProduct) => {
    const stored = await loadFromStorage();
    const filtered = stored.filter((i) => i.product.id !== product.id);
    const updated = [
      { product: snapshot(product), viewedAt: Date.now() },
      ...filtered,
    ].slice(0, MAX_ITEMS);
    await saveToStorage(updated);
    setItems(updated);
  }, []);

  const products = items.map((i) => i.product);

  return { items, products, addItem };
}
