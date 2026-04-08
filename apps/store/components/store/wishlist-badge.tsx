"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useWishlist } from "@/lib/wishlist";

export function WishlistBadge() {
  const { itemCount } = useWishlist();

  return (
    <Link
      href="/wishlist"
      className="relative inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
      aria-label={`Обране${itemCount > 0 ? ` (${itemCount})` : ""}`}
    >
      <Heart className="h-5 w-5" />
      {itemCount > 0 && (
        <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          {itemCount > 99 ? "99" : itemCount}
        </span>
      )}
    </Link>
  );
}
