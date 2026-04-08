"use client";

import { Button } from "@ltex/ui";
import { useCart, type CartItem } from "@/lib/cart";
import { ShoppingCart, Check } from "lucide-react";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

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
        aria-label={`${dict.cart.removeFromCart.replace("{name}", lot.productName)}`}
      >
        <Check className="mr-1 h-3 w-3" aria-hidden="true" />{dict.cart.inCart}
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      onClick={() => addItem(lot)}
      aria-label={`${dict.cart.addToCartLabel.replace("{name}", lot.productName)}`}
    >
      <ShoppingCart className="mr-1 h-3 w-3" aria-hidden="true" />
      {dict.cart.addToCart}
    </Button>
  );
}
