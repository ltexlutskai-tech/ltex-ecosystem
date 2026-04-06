"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart";

export function CartBadge() {
  const { itemCount, totalWeight } = useCart();

  return (
    <Link href="/cart" className="relative flex items-center gap-1 text-sm font-medium">
      <ShoppingCart className="h-5 w-5" />
      {itemCount > 0 && (
        <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-green-600 text-[10px] font-bold text-white">
          {itemCount}
        </span>
      )}
      {itemCount > 0 && (
        <span className="ml-2 hidden text-xs text-gray-500 sm:inline">
          {totalWeight.toFixed(1)} кг
        </span>
      )}
    </Link>
  );
}
