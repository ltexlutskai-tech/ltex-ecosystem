"use client";

import { useCart } from "@/lib/cart";
import { MIN_ORDER_KG } from "@ltex/shared";
import Link from "next/link";

export function CartPageClient() {
  const { items, totalWeight, totalEur, removeItem, updateQuantity, clearCart, isLoading } =
    useCart();

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold">Кошик</h1>
        <p className="text-muted-foreground">Завантаження...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold">Кошик</h1>
        <div className="rounded-lg border p-8 text-center">
          <p className="mb-4 text-muted-foreground">Кошик порожній</p>
          <Link
            href="/catalog"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Перейти до каталогу
          </Link>
        </div>
      </div>
    );
  }

  const isMinWeightMet = totalWeight >= MIN_ORDER_KG;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Кошик</h1>
        <button
          onClick={clearCart}
          className="text-sm text-destructive hover:underline"
        >
          Очистити кошик
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Cart items */}
        <div className="lg:col-span-2">
          <div className="divide-y rounded-lg border">
            {items.map((item) => (
              <div key={item.lotId} className="flex items-center gap-4 p-4">
                <div className="flex-1">
                  <h3 className="font-medium">{item.productName}</h3>
                  <p className="text-sm text-muted-foreground">
                    {item.weight} кг &middot; {item.priceEur.toFixed(2)} &euro;
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(item.lotId, item.quantity - 1)}
                    disabled={item.quantity <= 1}
                    className="flex h-8 w-8 items-center justify-center rounded border text-sm disabled:opacity-50"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-sm">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.lotId, item.quantity + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded border text-sm"
                  >
                    +
                  </button>
                </div>
                <p className="w-24 text-right font-medium">
                  {(item.priceEur * item.quantity).toFixed(2)} &euro;
                </p>
                <button
                  onClick={() => removeItem(item.lotId)}
                  className="text-sm text-destructive hover:underline"
                >
                  Видалити
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-semibold">Підсумок</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Товарів:</span>
              <span>{items.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Загальна вага:</span>
              <span>{totalWeight.toFixed(1)} кг</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Разом:</span>
              <span>{totalEur.toFixed(2)} &euro;</span>
            </div>
          </div>

          {!isMinWeightMet && (
            <p className="mt-4 text-sm text-destructive">
              Мінімальне замовлення — {MIN_ORDER_KG} кг. Зараз: {totalWeight.toFixed(1)} кг
            </p>
          )}

          <Link
            href="/checkout"
            className={`mt-4 flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium ${
              isMinWeightMet
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "pointer-events-none bg-muted text-muted-foreground"
            }`}
          >
            Оформити замовлення
          </Link>
        </div>
      </div>
    </div>
  );
}
