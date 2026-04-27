/**
 * Wishlist (favorites) state for mobile client.
 *
 * Local-first: items persist in SecureStore so the heart icon survives
 * app restart even when the user is logged out. When a customer is signed
 * in, mutations are mirrored to /api/mobile/favorites best-effort.
 */

import { createContext, useContext } from "react";
import type { WebCatalogProduct } from "./api";

export interface WishlistContextType {
  items: WebCatalogProduct[];
  has: (productId: string) => boolean;
  toggle: (product: WebCatalogProduct) => void;
  isLoading: boolean;
}

export const WishlistContext = createContext<WishlistContextType | null>(null);

export function useWishlist(): WishlistContextType {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within WishlistProvider");
  return ctx;
}
