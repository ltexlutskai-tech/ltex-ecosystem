"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface RecentlyViewedItem {
  id: string;
  slug: string;
  name: string;
  quality: string;
  imageUrl: string | null;
  priceEur: number | null;
  priceUnit: string;
  viewedAt: number;
}

interface RecentlyViewedContextType {
  items: RecentlyViewedItem[];
  addItem: (item: Omit<RecentlyViewedItem, "viewedAt">) => void;
}

const RecentlyViewedContext = createContext<RecentlyViewedContextType | null>(
  null,
);

const STORAGE_KEY = "ltex-recently-viewed";
const MAX_ITEMS = 12;

export function RecentlyViewedProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as RecentlyViewedItem[];
        // Drop legacy entries without `id` — they will be re-added on next view.
        setItems(parsed.filter((item) => typeof item.id === "string"));
      }
    } catch {}
  }, []);

  const addItem = useCallback((item: Omit<RecentlyViewedItem, "viewedAt">) => {
    setItems((prev) => {
      const filtered = prev.filter((i) => i.slug !== item.slug);
      const updated = [{ ...item, viewedAt: Date.now() }, ...filtered].slice(
        0,
        MAX_ITEMS,
      );
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  return (
    <RecentlyViewedContext.Provider value={{ items, addItem }}>
      {children}
    </RecentlyViewedContext.Provider>
  );
}

export function useRecentlyViewed() {
  const ctx = useContext(RecentlyViewedContext);
  if (!ctx)
    throw new Error(
      "useRecentlyViewed must be used within RecentlyViewedProvider",
    );
  return ctx;
}
