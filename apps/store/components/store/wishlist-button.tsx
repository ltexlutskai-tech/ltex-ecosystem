"use client";

import { Heart } from "lucide-react";
import { useWishlist, type WishlistItem } from "@/lib/wishlist";

interface WishlistButtonProps {
  product: WishlistItem;
  size?: "sm" | "md";
}

export function WishlistButton({ product, size = "sm" }: WishlistButtonProps) {
  const { addItem, removeItem, isInWishlist } = useWishlist();
  const inWishlist = isInWishlist(product.productId);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (inWishlist) {
      removeItem(product.productId);
    } else {
      addItem(product);
    }
  }

  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <button
      onClick={toggle}
      data-analytics="wishlist-toggle"
      className={`rounded-full bg-white/90 p-2 shadow-md transition-colors hover:bg-white ${
        inWishlist ? "text-red-500" : "text-gray-400 hover:text-red-400"
      }`}
      aria-label={inWishlist ? "Видалити з обраного" : "Додати до обраного"}
    >
      <Heart className={iconSize} fill={inWishlist ? "currentColor" : "none"} />
    </button>
  );
}
