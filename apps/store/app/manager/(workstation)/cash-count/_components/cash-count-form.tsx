"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@ltex/ui";

const CURRENCIES = [
  { key: "UAH" as const, label: "Гривня ₴" },
  { key: "EUR" as const, label: "Євро €" },
  { key: "USD" as const, label: "Долар $" },
];

function fmt(n: number): string {
  return new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Форма щоденного підбиття каси: облік показує система, факт вносить
 * бухгалтер, різниця рахується наживо. Після збереження — підказка, який
 * касовий документ створити для вирівнювання (недостача → розхід, надлишок →
 * прихід/внесення).
 */
export function CashCountForm({
  expected,
}: {
  expected: { UAH: number; EUR: number; USD: number };
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>({
    UAH: "",
    EUR: "",
    USD: "",
  });
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const diffs = useMemo(
    () =>
      CURRENCIES.map((c) => {
        const actualRaw = values[c.key]?.replace(",", ".") ?? "";
        const actual = actualRaw === "" ? null : Number(actualRaw);
        const valid = actual !== null && Number.isFinite(actual) && actual >= 0;
        const diff = valid
          ? Math.round((actual - expected[c.key]) * 100) / 100
          : null;
        return { ...c, actual, valid, diff };
      }),
    [values, expected],
  );

  const allValid = diffs.every((d) => d.valid);
  const problems = diffs.filter((d) => d.diff !== null && d.diff !== 0);

  async function save() {
    if (!allValid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/manager/cash-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualUah: diffs[0]?.actual ?? 0,
          actualEur: diffs[1]?.actual ?? 0,
          actualUsd: diffs[2]?.actual ?? 0,
          comment: comment.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? `Помилка ${res.status}`);
        return;
      }
      setSavedAt(new Date().toLocaleTimeString("uk-UA"));
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border bg-white p-4">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="py-2">Валюта</th>
            <th className="py-2 text-right">Облік (система)</th>
            <th className="py-2 text-right">Факт (пораховано)</th>
            <th className="py-2 text-right">Різниця</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {diffs.map((d) => (
            <tr key={d.key}>
              <td className="py-2 font-medium">{d.label}</td>
              <td className="py-2 text-right tabular-nums text-gray-600">
                {fmt(expected[d.key])}
              </td>
              <td className="py-2 text-right">
                <input
                  type="text"
                  inputMode="decimal"
                  value={values[d.key] ?? ""}
                  onChange={(e) =>
                    setValues((p) => ({ ...p, [d.key]: e.target.value }))
                  }
                  placeholder="0.00"
                  className="h-9 w-32 rounded border border-gray-300 px-2 text-right tabular-nums"
                  aria-label={`Фактичний залишок ${d.label}`}
                />
              </td>
              <td
                className={`py-2 text-right font-semibold tabular-nums ${
                  d.diff === null
                    ? "text-gray-300"
                    : d.diff === 0
                      ? "text-emerald-600"
                      : "text-red-600"
                }`}
              >
                {d.diff === null ? "—" : d.diff === 0 ? "0.00 ✓" : fmt(d.diff)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {problems.length > 0 ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {problems.map((p) => (
            <p key={p.key}>
              {p.diff !== null && p.diff < 0 ? (
                <>
                  <b>
                    Недостача {fmt(Math.abs(p.diff))} ({p.label}).
                  </b>{" "}
                  Знайдіть незадокументовану видачу або створіть{" "}
                  <Link
                    href="/manager/payments/new"
                    className="font-medium underline"
                  >
                    розхідний касовий ордер
                  </Link>{" "}
                  на вирівнювання.
                </>
              ) : (
                <>
                  <b>
                    Надлишок {fmt(p.diff ?? 0)} ({p.label}).
                  </b>{" "}
                  Ймовірно, є непроведена оплата — перевірте чернетки в{" "}
                  <Link
                    href="/manager/payments"
                    className="font-medium underline"
                  >
                    Оплатах
                  </Link>{" "}
                  або створіть{" "}
                  <Link
                    href="/manager/payments/new"
                    className="font-medium underline"
                  >
                    прихідний ордер
                  </Link>
                  .
                </>
              )}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-sm">
          <span className="text-xs text-gray-500">
            Коментар (необовʼязково)
          </span>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Напр.: різниця — здача без документа, виправлено"
            className="h-9 rounded border border-gray-300 px-2"
          />
        </label>
        <Button
          type="button"
          onClick={() => void save()}
          disabled={busy || !allValid}
        >
          {busy ? "Зберігаємо…" : "💾 Зафіксувати підбиття"}
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {savedAt ? (
        <p className="mt-2 text-sm text-emerald-700">
          ✓ Підбиття збережено о {savedAt}.
        </p>
      ) : null}
    </div>
  );
}
