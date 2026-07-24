"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Привʼязка рахунку банківського фіда до нашого довідника рахунків
 * (MgrBankAccount) — селект прямо на картці залишку. Потрібна, щоб у Кроці 3
 * авто-платіжки лягали на правильний рахунок обліку.
 */
export function FeedAccountLink({
  feedAccountId,
  current,
  options,
}: {
  feedAccountId: string;
  current: string | null;
  options: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function save(mgrBankAccountId: string) {
    setError(null);
    const res = await fetch("/api/v1/manager/bank-feed/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedAccountId,
        mgrBankAccountId: mgrBankAccountId || null,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error ?? `Помилка ${res.status}`);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-2">
      <select
        value={current ?? ""}
        onChange={(e) => void save(e.target.value)}
        disabled={isPending}
        className="h-7 w-full rounded border border-gray-200 bg-white px-1.5 text-xs text-gray-600"
        aria-label="Рахунок обліку"
      >
        <option value="">— не привʼязано до обліку —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
