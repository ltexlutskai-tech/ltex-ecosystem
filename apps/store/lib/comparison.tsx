"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface ComparisonItem {
  productId: string;
  slug: string;
  name: string;
  quality: string;
  season: string;
  priceUnit: string;
  country: string;
  imageUrl: string | null;
  priceEur: number | null;
}

interface ComparisonContextType {
  items: ComparisonItem[];
  addItem: (item: ComparisonItem) => void;
  removeItem: (productId: string) => void;
  isInComparison: (productId: string) => boolean;
  clearAll: () => void;
  itemCount: number;
}

const ComparisonContext = createContext<ComparisonContextType | null>(null);

const STORAGE_KEY = "ltex-comparison";
const MAX_ITEMS = 3;

export function ComparisonProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ComparisonItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setItems(JSON.parse(saved));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items, loaded]);

  const addItem = useCallback((item: ComparisonItem) => {
    setItems((prev) => {
      if (prev.some((i) => i.productId === item.productId)) return prev;
      if (prev.length >= MAX_ITEMS) return prev;
      return [...prev, item];
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const isInComparison = useCallback(
    (productId: string) => items.some((i) => i.productId === productId),
    [items],
  );

  const clearAll = useCallback(() => setItems([]), []);

  return (
    <ComparisonContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        isInComparison,
        clearAll,
        itemCount: items.length,
      }}
    >
      {children}
    </ComparisonContext.Provider>
  );
}

export function useComparison() {
  const ctx = useContext(ComparisonContext);
  if (!ctx)
    throw new Error("useComparison must be used within ComparisonProvider");
  return ctx;
}
