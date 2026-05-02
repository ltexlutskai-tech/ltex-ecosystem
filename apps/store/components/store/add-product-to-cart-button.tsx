"use client";

import { Button } from "@ltex/ui";
import { useCart, cartItemKey } from "@/lib/cart";
import { ShoppingCart, Check } from "lucide-react";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

interface AddProductToCartButtonProps {
  productId: string;
  productName: string;
  priceEur: number;
  // Average lot weight is the quote-on-checkout default — manager can adjust.
  weight: number;
}

/**
 * Primary CTA for the product detail page: adds the product to the cart
 * WITHOUT a specific lotId. The manager picks an available lot when
 * confirming the order. Distinct from the per-lot AddToCartButton in
 * <LotReviews> — those carry barcode/lotId for explicit selection.
 */
export function AddProductToCartButton({
  productId,
  productName,
  priceEur,
  weight,
}: AddProductToCartButtonProps) {
  const { items, addItem, removeItem } = useCart();
  const key = cartItemKey({ productId });
  const inCart = items.some((i) => cartItemKey(i) === key);

  if (inCart) {
    return (
      <Button
        size="lg"
        variant="outline"
        onClick={() => removeItem(key)}
        className="flex-1 border-2 border-green-600 py-6 text-base font-semibold text-green-700 hover:bg-green-50"
        aria-label={`Прибрати ${productName} із замовлення`}
      >
        <Check className="mr-2 h-5 w-5" aria-hidden />У замовленні
      </Button>
    );
  }

  return (
    <Button
      size="lg"
      onClick={() =>
        addItem({
          productId,
          productName,
          weight,
          priceEur,
          quantity: 1,
        })
      }
      data-analytics="add-product-to-cart"
      aria-label={`${dict.cart.addToCartLabel.replace("{name}", productName)}`}
      className="flex-1 bg-green-600 py-6 text-base font-semibold shadow-sm hover:bg-green-700"
    >
      <ShoppingCart className="mr-2 h-5 w-5" aria-hidden />
      Додати до замовлення
    </Button>
  );
}
