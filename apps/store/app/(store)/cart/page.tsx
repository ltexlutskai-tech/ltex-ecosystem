"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@ltex/ui";
import { MIN_ORDER_KG, CONTACTS } from "@ltex/shared";
import { useCart, cartItemKey } from "@/lib/cart";
import { Trash2, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

export default function CartPage() {
  const { items, removeItem, clearCart, totalWeight, totalEur, itemCount } =
    useCart();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerTelegram, setCustomerTelegram] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<{
    success: boolean;
    orderId?: string;
    error?: string;
  } | null>(null);
  const router = useRouter();

  const isMinWeight = totalWeight >= MIN_ORDER_KG;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isMinWeight) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: customerName,
            phone: customerPhone,
            telegram: customerTelegram || undefined,
          },
          items: items.map((i) => ({
            ...(i.lotId ? { lotId: i.lotId } : {}),
            productId: i.productId,
            priceEur: i.priceEur,
            weight: i.weight,
            quantity: i.quantity,
          })),
          notes: notes || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        clearCart();
        router.push(`/order/${data.orderId}/confirmation`);
        return;
      } else {
        setOrderResult({
          success: false,
          error: data.error ?? dict.common.error,
        });
      }
    } catch {
      setOrderResult({ success: false, error: dict.cart.networkError });
    } finally {
      setSubmitting(false);
    }
  }

  if (orderResult?.success) {
    return (
      <div className="container mx-auto flex flex-col items-center px-4 py-16 text-center">
        <div className="text-4xl">&#10003;</div>
        <h1 className="mt-4 text-2xl font-bold text-green-700">
          {dict.cart.orderPlaced}
        </h1>
        <p className="mt-2 text-gray-500">{dict.cart.weWillContact}</p>
        <p className="mt-1 text-sm text-gray-400">ID: {orderResult.orderId}</p>
        <div className="mt-6 flex gap-3">
          <Button asChild>
            <Link href="/catalog">{dict.cart.continueShopping}</Link>
          </Button>
          <Button variant="outline" asChild>
            <a
              href={`https://t.me/${CONTACTS.telegram.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {dict.cart.writeToTelegram}
            </a>
          </Button>
        </div>
      </div>
    );
  }

  if (itemCount === 0) {
    return (
      <div className="container mx-auto flex flex-col items-center px-4 py-16 text-center">
        <ShoppingCart className="h-12 w-12 text-gray-300" />
        <h1 className="mt-4 text-2xl font-bold">{dict.cart.empty}</h1>
        <p className="mt-2 text-gray-500">{dict.cart.addFromCatalog}</p>
        <Button className="mt-6" asChild>
          <Link href="/catalog">{dict.cart.toCatalog}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold">{dict.cart.title}</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        {/* Items */}
        <div className="lg:col-span-2">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">{dict.cart.product}</th>
                  <th className="px-4 py-3 font-medium">{dict.cart.barcode}</th>
                  <th className="px-4 py-3 font-medium">{dict.cart.weight}</th>
                  <th className="px-4 py-3 font-medium">
                    {dict.cart.priceEur}
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const key = cartItemKey(item);
                  return (
                    <tr key={key} className="border-b">
                      <td className="px-4 py-3 font-medium">
                        {item.productName}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {item.barcode ?? (
                          <span className="italic text-gray-400">без лоту</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {item.weight} {dict.catalog.perKg}
                      </td>
                      <td className="px-4 py-3">€{item.priceEur.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => removeItem(key)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm">
            <button
              onClick={clearCart}
              className="text-red-500 hover:underline"
            >
              {dict.cart.clearCart}
            </button>
          </div>
        </div>

        {/* Order form */}
        <div>
          <div className="rounded-lg border bg-white p-6">
            <h2 className="text-lg font-bold">{dict.cart.summary}</h2>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{dict.cart.lotsCount}:</span>
                <span className="font-medium">{itemCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{dict.cart.totalWeight}:</span>
                <span className="font-medium">
                  {totalWeight.toFixed(1)} {dict.catalog.perKg}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">{dict.cart.total}:</span>
                <span className="text-lg font-bold text-green-700">
                  €{totalEur.toFixed(2)}
                </span>
              </div>
            </div>

            {!isMinWeight && (
              <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
                {dict.cart.minWeight
                  .replace("{min}", String(MIN_ORDER_KG))
                  .replace("{current}", totalWeight.toFixed(1))}
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {dict.cart.name} *
                </label>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="ФОП Іваненко"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {dict.cart.phone} *
                </label>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  required
                  type="tel"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="+380..."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {dict.cart.telegram}
                </label>
                <input
                  value={customerTelegram}
                  onChange={(e) => setCustomerTelegram(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="@username"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {dict.cart.comment}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  rows={2}
                />
              </div>

              {orderResult?.error && (
                <p className="text-sm text-red-600">{orderResult.error}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={!isMinWeight || submitting}
              >
                {submitting ? dict.cart.submitting : dict.cart.submit}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
