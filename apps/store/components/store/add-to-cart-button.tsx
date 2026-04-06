"use client";

import { Button } from "@ltex/ui";
import { useCart, type CartItem } from "@/lib/cart";
import { ShoppingCart, Check } from "lucide-react";

export function AddToCartButton({ lot }: { lot: CartItem }) {
  const { items, addItem, removeItem } = useCart();
  const inCart = items.some((i) => i.lotId === lot.lotId);

  if (inCart) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => removeItem(lot.lotId)}
        className="text-green-700"
      >
        <Check className="mr-1 h-3 w-3" />
        В кошику
      </Button>
    );
  }

  return (
    <Button size="sm" onClick={() => addItem(lot)}>
      <ShoppingCart className="mr-1 h-3 w-3" />
      Додати
    </Button>
  );
}
