"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@ltex/ui";
import { MIN_ORDER_KG, CONTACTS } from "@ltex/shared";
import { useCart } from "@/lib/cart";
import { Trash2, ShoppingCart } from "lucide-react";
import Link from "next/link";

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
            lotId: i.lotId,
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
        setOrderResult({ success: true, orderId: data.orderId });
        clearCart();
      } else {
        setOrderResult({ success: false, error: data.error ?? "Помилка" });
      }
    } catch {
      setOrderResult({ success: false, error: "Помилка мережі" });
    } finally {
      setSubmitting(false);
    }
  }

  if (orderResult?.success) {
    return (
      <div className="container mx-auto flex flex-col items-center px-4 py-16 text-center">
        <div className="text-4xl">&#10003;</div>
        <h1 className="mt-4 text-2xl font-bold text-green-700">
          Замовлення оформлено!
        </h1>
        <p className="mt-2 text-gray-500">
          Ми зв&apos;яжемося з вами для підтвердження.
        </p>
        <p className="mt-1 text-sm text-gray-400">
          ID: {orderResult.orderId}
        </p>
        <div className="mt-6 flex gap-3">
          <Button asChild>
            <Link href="/catalog">Продовжити покупки</Link>
          </Button>
          <Button variant="outline" asChild>
            <a
              href={`https://t.me/${CONTACTS.telegram.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Написати в Telegram
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
        <h1 className="mt-4 text-2xl font-bold">Кошик порожній</h1>
        <p className="mt-2 text-gray-500">Додайте лоти з каталогу</p>
        <Button className="mt-6" asChild>
          <Link href="/catalog">До каталогу</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold">Кошик</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        {/* Items */}
        <div className="lg:col-span-2">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Товар</th>
                  <th className="px-4 py-3 font-medium">Штрихкод</th>
                  <th className="px-4 py-3 font-medium">Вага</th>
                  <th className="px-4 py-3 font-medium">Ціна EUR</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.lotId} className="border-b">
                    <td className="px-4 py-3 font-medium">
                      {item.productName}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {item.barcode}
                    </td>
                    <td className="px-4 py-3">{item.weight} кг</td>
                    <td className="px-4 py-3">€{item.priceEur.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => removeItem(item.lotId)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm">
            <button
              onClick={clearCart}
              className="text-red-500 hover:underline"
            >
              Очистити кошик
            </button>
          </div>
        </div>

        {/* Order form */}
        <div>
          <div className="rounded-lg border bg-white p-6">
            <h2 className="text-lg font-bold">Підсумок</h2>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Лотів:</span>
                <span className="font-medium">{itemCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Загальна вага:</span>
                <span className="font-medium">{totalWeight.toFixed(1)} кг</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">Сума:</span>
                <span className="text-lg font-bold text-green-700">
                  €{totalEur.toFixed(2)}
                </span>
              </div>
            </div>

            {!isMinWeight && (
              <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
                Мінімальне замовлення — від {MIN_ORDER_KG} кг. Зараз:{" "}
                {totalWeight.toFixed(1)} кг
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Ім&apos;я / Назва *
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
                  Телефон *
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
                  Telegram
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
                  Коментар
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
                {submitting ? "Оформлення..." : "Оформити замовлення"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
