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
        aria-label={`Видалити ${lot.productName} з кошика`}
      >
        <Check className="mr-1 h-3 w-3" aria-hidden="true" />
        В кошику
      </Button>
    );
  }

  return (
    <Button size="sm" onClick={() => addItem(lot)} aria-label={`Додати ${lot.productName} до кошика`}>
      <ShoppingCart className="mr-1 h-3 w-3" aria-hidden="true" />
      Додати
    </Button>
  );
}
