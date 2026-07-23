"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input } from "@ltex/ui";
import { UA_REGIONS } from "@/lib/constants/regions";

/**
 * Форма «Отримати прайс лист» (лід-захоплення, Stage 2 Відеозони).
 * Імʼя + телефон + область → POST /api/price-list-request → лід з
 * маршрутизацією на менеджера області. Після успіху — подяка + лінк у каталог.
 */
export function PriceRequestForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit =
    name.trim().length >= 2 && phone.trim().length >= 9 && region !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/price-list-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          region,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Не вдалося надіслати — спробуйте ще раз");
        return;
      }
      setDone(true);
    } catch {
      setError("Помилка зʼєднання — спробуйте ще раз");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-2xl">✅</p>
        <h2 className="mt-2 text-lg font-semibold text-green-800">
          Дякуємо! Заявку прийнято
        </h2>
        <p className="mt-1 text-sm text-green-700">
          Менеджер вашої області звʼяжеться з вами й надішле актуальний прайс.
        </p>
        <Link
          href="/catalog"
          className="mt-4 inline-block rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Переглянути каталог
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-lg border bg-white p-6"
    >
      <div>
        <label
          htmlFor="pr-name"
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          Імʼя
        </label>
        <Input
          id="pr-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Як до вас звертатись"
          autoComplete="name"
          required
        />
      </div>
      <div>
        <label
          htmlFor="pr-phone"
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          Телефон
        </label>
        <Input
          id="pr-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+380 __ ___ __ __"
          autoComplete="tel"
          required
        />
      </div>
      <div>
        <label
          htmlFor="pr-region"
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          Область
        </label>
        <select
          id="pr-region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          required
          className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
        >
          <option value="">Оберіть область…</option>
          {UA_REGIONS.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Button
        type="submit"
        disabled={!canSubmit || submitting}
        className="w-full"
      >
        {submitting ? "Надсилаємо…" : "Отримати прайс"}
      </Button>
      <p className="text-center text-xs text-gray-400">
        Надсилаючи форму, ви погоджуєтесь на звʼязок від менеджера L-TEX.
      </p>
    </form>
  );
}
