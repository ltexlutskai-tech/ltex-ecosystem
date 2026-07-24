"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@ltex/ui";
import { ClientPicker } from "../../orders/new/_components/client-picker";

export interface UnmatchedTxnRow {
  id: string;
  occurredAt: string; // ISO
  accountTitle: string;
  accountLinked: boolean;
  amount: number;
  currencyCode: string;
  counterName: string | null;
  counterIban: string | null;
  counterEdrpou: string | null;
  purpose: string | null;
  matchNote: string | null;
}

export interface ArticleOption {
  id: string;
  name: string;
}

function fmtMoney(value: number, currency: string): string {
  const sym: Record<string, string> = { UAH: "₴", EUR: "€", USD: "$" };
  return `${new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} ${sym[currency] ?? currency}`;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Дошка «Нерознесені гроші» (Крок 3): операції, які воронка не впізнала.
 * Прихід → обрати клієнта (+ «запамʼятати платника» → далі само); розхід →
 * обрати статтю ДДС. «Ігнорувати» — для внутрішніх переказів тощо.
 */
export function UnmatchedBoard({
  rows,
  articles,
}: {
  rows: UnmatchedTxnRow[];
  articles: ArticleOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clientByTxn, setClientByTxn] = useState<Record<string, string | null>>(
    {},
  );
  const [rememberByTxn, setRememberByTxn] = useState<Record<string, boolean>>(
    {},
  );
  const [articleByTxn, setArticleByTxn] = useState<Record<string, string>>({});

  async function callApi(txnId: string, path: string, body?: unknown) {
    setBusyId(txnId);
    setErrors((p) => ({ ...p, [txnId]: "" }));
    try {
      const res = await fetch(
        `/api/v1/manager/bank-feed/transactions/${txnId}/${path}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setErrors((p) => ({
          ...p,
          [txnId]: data?.error ?? `Помилка ${res.status}`,
        }));
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        ✓ Нерознесених операцій немає — всі гроші на своїх місцях.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((t) => {
        const isIncome = t.amount > 0;
        const busy = busyId === t.id;
        return (
          <div
            key={t.id}
            className={`rounded-md border bg-white p-4 ${
              isIncome
                ? "border-l-4 border-l-red-400"
                : "border-l-4 border-l-amber-400"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-gray-500">
                  {fmtDateTime(t.occurredAt)} · {t.accountTitle}
                </p>
                <p className="mt-0.5 font-medium text-gray-900">
                  {t.counterName ?? "Невідомий платник"}
                  {t.counterEdrpou ? (
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      ЄДРПОУ {t.counterEdrpou}
                    </span>
                  ) : null}
                </p>
                {t.counterIban ? (
                  <p className="text-xs text-gray-400">{t.counterIban}</p>
                ) : null}
                {t.purpose ? (
                  <p className="mt-1 text-sm text-gray-600">«{t.purpose}»</p>
                ) : null}
                {t.matchNote ? (
                  <p className="mt-1 text-xs text-amber-700">{t.matchNote}</p>
                ) : null}
              </div>
              <p
                className={`text-lg font-bold tabular-nums ${
                  isIncome ? "text-emerald-700" : "text-gray-700"
                }`}
              >
                {isIncome ? "+" : ""}
                {fmtMoney(t.amount, t.currencyCode)}
              </p>
            </div>

            <div className="mt-3 border-t pt-3">
              {isIncome ? (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[260px] flex-1">
                    <ClientPicker
                      value={clientByTxn[t.id] ?? null}
                      onChange={(clientId) =>
                        setClientByTxn((p) => ({ ...p, [t.id]: clientId }))
                      }
                    />
                  </div>
                  <label className="flex items-center gap-2 pb-1 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={rememberByTxn[t.id] ?? true}
                      onChange={(e) =>
                        setRememberByTxn((p) => ({
                          ...p,
                          [t.id]: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-gray-300 text-emerald-600"
                    />
                    Запамʼятати платника
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || !t.accountLinked || !clientByTxn[t.id]}
                    onClick={() =>
                      void callApi(t.id, "match", {
                        clientId: clientByTxn[t.id],
                        remember: rememberByTxn[t.id] ?? true,
                      })
                    }
                  >
                    {busy ? "Проводимо…" : "✓ Провести на клієнта"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void callApi(t.id, "ignore")}
                  >
                    Ігнорувати
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-sm">
                    <span className="text-xs text-gray-500">
                      Стаття руху коштів (розхід)
                    </span>
                    <select
                      value={articleByTxn[t.id] ?? ""}
                      onChange={(e) =>
                        setArticleByTxn((p) => ({
                          ...p,
                          [t.id]: e.target.value,
                        }))
                      }
                      className="h-9 rounded border border-gray-300 px-2"
                    >
                      <option value="">— оберіть статтю —</option>
                      {articles.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || !t.accountLinked || !articleByTxn[t.id]}
                    onClick={() =>
                      void callApi(t.id, "match", {
                        cashFlowArticleId: articleByTxn[t.id],
                      })
                    }
                  >
                    {busy ? "Проводимо…" : "✓ Провести розхід"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void callApi(t.id, "ignore")}
                  >
                    Ігнорувати
                  </Button>
                </div>
              )}
              {!t.accountLinked ? (
                <p className="mt-2 text-xs text-amber-700">
                  Рахунок фіда не привʼязано до довідника — привʼяжіть його на
                  картці залишку вгорі, тоді проведення стане доступним.
                </p>
              ) : null}
              {errors[t.id] ? (
                <p className="mt-2 text-xs text-red-600">{errors[t.id]}</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
