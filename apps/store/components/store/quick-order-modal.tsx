"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@ltex/ui";

interface QuickOrderLot {
  id: string;
  barcode: string;
  productId: string;
  productName: string;
  weight: number;
  priceEur: number;
  quantity: number;
}

interface QuickOrderModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lot: QuickOrderLot;
}

export function QuickOrderModal({
  open,
  onOpenChange,
  lot,
}: QuickOrderModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function reset() {
    setName("");
    setPhone("");
    setError(null);
    setSuccess(false);
  }

  function handleClose(next: boolean) {
    onOpenChange(next);
    if (!next) {
      // Defer reset until close animation has run.
      setTimeout(reset, 200);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/quick-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { name, phone },
          lotId: lot.id,
          productId: lot.productId,
          priceEur: lot.priceEur,
          weight: lot.weight,
          quantity: lot.quantity,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Не вдалося надіслати заявку");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Помилка мережі. Перевірте інтернет і спробуйте ще раз.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogTitle className="text-green-700">
            Заявку прийнято ✓
          </DialogTitle>
          <DialogDescription>
            Менеджер зв&apos;яжеться з вами найближчим часом для підтвердження
            замовлення. Передоплата не потрібна.
          </DialogDescription>
          <button
            type="button"
            onClick={() => handleClose(false)}
            className="mt-4 w-full rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
          >
            Закрити
          </button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogTitle>Купити в один клік</DialogTitle>
        <DialogDescription>
          Лот {lot.barcode} — {lot.productName}, {lot.weight} кг
        </DialogDescription>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label
              htmlFor="quick-order-name"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Ваше ім&apos;я *
            </label>
            <input
              id="quick-order-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={100}
              className="w-full rounded-md border px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label
              htmlFor="quick-order-phone"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Телефон *
            </label>
            <input
              id="quick-order-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              type="tel"
              placeholder="+380..."
              minLength={8}
              maxLength={30}
              className="w-full rounded-md border px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Надсилається..." : "Надіслати заявку"}
          </button>
          <p className="text-center text-xs text-gray-500">
            Менеджер зв&apos;яжеться для підтвердження. Передоплата не потрібна.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
