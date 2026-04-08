"use client";

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface CartItem {
  lotId: string;
  productId: string;
  productName: string;
  barcode: string;
  weight: number;
  priceEur: number;
  quantity: number;
}

interface CartState {
  items: CartItem[];
}

type CartAction =
  | { type: "ADD"; item: CartItem }
  | { type: "REMOVE"; lotId: string }
  | { type: "CLEAR" }
  | { type: "LOAD"; items: CartItem[] };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD": {
      const exists = state.items.find((i) => i.lotId === action.item.lotId);
      if (exists) return state;
      return { items: [...state.items, action.item] };
    }
    case "REMOVE":
      return { items: state.items.filter((i) => i.lotId !== action.lotId) };
    case "CLEAR":
      return { items: [] };
    case "LOAD":
      return { items: action.items };
  }
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (lotId: string) => void;
  clearCart: () => void;
  totalWeight: number;
  totalEur: number;
  itemCount: number;
  isLoading: boolean;
}

const CartContext = createContext<CartContextType | null>(null);

const STORAGE_KEY = "ltex-cart";
const SESSION_ID_KEY = "ltex-session-id";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

async function fetchServerCart(sessionId: string): Promise<CartItem[]> {
  try {
    const res = await fetch(
      `/api/cart?sessionId=${encodeURIComponent(sessionId)}`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

async function syncCartToServer(sessionId: string, items: CartItem[]) {
  try {
    await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, items }),
    });
  } catch {
    // Fallback to localStorage only
  }
}

function mergeItems(local: CartItem[], server: CartItem[]): CartItem[] {
  const merged = new Map<string, CartItem>();
  for (const item of server) {
    merged.set(item.lotId, item);
  }
  for (const item of local) {
    if (!merged.has(item.lotId)) {
      merged.set(item.lotId, item);
    }
  }
  return Array.from(merged.values());
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });
  const [isLoading, setIsLoading] = useState(true);

  // Load cart: merge localStorage + server on mount
  useEffect(() => {
    async function init() {
      let localItems: CartItem[] = [];
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) localItems = JSON.parse(saved);
      } catch {}

      const sessionId = getSessionId();
      const serverItems = await fetchServerCart(sessionId);
      const merged = mergeItems(localItems, serverItems);
      dispatch({ type: "LOAD", items: merged });

      // Sync merged back if there are new local items
      if (merged.length > 0 && merged.length !== serverItems.length) {
        await syncCartToServer(sessionId, merged);
      }
      setIsLoading(false);
    }
    init();
  }, []);

  // Save to localStorage + server on changes
  useEffect(() => {
    if (isLoading) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    } catch {}
    syncCartToServer(getSessionId(), state.items);
  }, [state.items, isLoading]);

  const addItem = useCallback(
    (item: CartItem) => dispatch({ type: "ADD", item }),
    [],
  );
  const removeItem = useCallback(
    (lotId: string) => dispatch({ type: "REMOVE", lotId }),
    [],
  );
  const clearCart = useCallback(() => dispatch({ type: "CLEAR" }), []);

  const totalWeight = state.items.reduce((sum, i) => sum + i.weight, 0);
  const totalEur = state.items.reduce((sum, i) => sum + i.priceEur, 0);

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        addItem,
        removeItem,
        clearCart,
        totalWeight,
        totalEur,
        itemCount: state.items.length,
        isLoading,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
