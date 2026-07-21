"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@ltex/ui";
import { BadgeCheck, RotateCcw } from "lucide-react";

export interface NpCheckRow {
  id: string;
  createdAt: string;
  saleId: string | null;
  saleNumber: string;
  customerName: string | null;
  ttn: string | null;
  amountUah: number;
  verified: boolean;
  verifiedByName: string | null;
}

export interface NpCheckSummary {
  total: number;
  verified: number;
  unverified: number;
  totalUah: number;
}

function formatDateTime(iso: string): string {
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

function formatUah(n: number): string {
  return new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function NpCheckClient({
  rows,
  summary,
  from,
  to,
}: {
  rows: NpCheckRow[];
  summary: NpCheckSummary;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  // Обирати можна лише ще не перевірені (масова дія — «позначити перевіреними»).
  const selectableIds = useMemo(
    () => rows.filter((r) => !r.verified).map((r) => r.id),
    [rows],
  );
  const allSelected =
    selectableIds.length > 0 && selected.size === selectableIds.length;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === selectableIds.length ? new Set() : new Set(selectableIds),
    );
  }

  function submit(ids: string[], verified: boolean) {
    if (ids.length === 0) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/v1/manager/novapay-check/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, verified }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast({
            title: "Помилка",
            description: body.error ?? "Не вдалося зберегти",
            variant: "destructive",
          });
          return;
        }
        toast({
          title: verified
            ? `Позначено перевіреними: ${body.updated ?? ids.length}`
            : "Позначку знято",
        });
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        toast({
          title: "Помилка",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      }
    });
  }

  const allClear = summary.total > 0 && summary.unverified === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Звірка NovaPay</h1>
        <p className="mt-1 text-sm text-gray-500">
          Перевірте, що кожна авто-оплата післяплати NovaPay справді надійшла на
          рахунок, і позначте «Перевірено».
        </p>
      </div>

      {/* ── Період ─────────────────────────────────────────────────────── */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Від
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="rounded border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          До
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="rounded border px-2 py-1.5 text-sm"
          />
        </label>
        <Button type="submit" size="sm" variant="outline">
          Показати
        </Button>
      </form>

      {/* ── Зведення ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-md border bg-white px-3 py-2 text-gray-700">
          Усього: <b>{summary.total}</b>
        </span>
        <span className="rounded-md border bg-white px-3 py-2 text-gray-700">
          Перевірено: <b>{summary.verified}</b>
        </span>
        {allClear ? (
          <span className="rounded-md border border-green-300 bg-green-50 px-3 py-2 font-medium text-green-700">
            ✓ Усе звірено
          </span>
        ) : (
          <span className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 font-medium text-amber-700">
            Не перевірено: <b>{summary.unverified}</b>
          </span>
        )}
        <span className="rounded-md border bg-white px-3 py-2 text-gray-700">
          Сума: <b>{formatUah(summary.totalUah)}</b> грн
        </span>
      </div>

      {/* ── Таблиця ────────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Авто-оплати NovaPay
          </h2>
          <Button
            size="sm"
            onClick={() => submit([...selected], true)}
            disabled={selected.size === 0 || isPending}
          >
            <BadgeCheck className="mr-1.5 h-4 w-4" />
            Позначити перевіреними ({selected.size})
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">
            За обраний період авто-оплат NovaPay немає.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-gray-500">
                  <th className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      disabled={selectableIds.length === 0}
                      aria-label="Обрати всі"
                    />
                  </th>
                  <th className="px-4 py-2">Дата</th>
                  <th className="px-4 py-2">Реалізація</th>
                  <th className="px-4 py-2">Клієнт</th>
                  <th className="px-4 py-2">ТТН</th>
                  <th className="px-4 py-2 text-right">Сума, грн</th>
                  <th className="px-4 py-2">Стан</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        disabled={r.verified}
                        aria-label={`Обрати ${r.saleNumber}`}
                      />
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-gray-600">
                      {formatDateTime(r.createdAt)}
                    </td>
                    <td className="px-4 py-2">
                      {r.saleId ? (
                        <Link
                          href={`/manager/sales/${r.saleId}`}
                          className="text-blue-600 hover:underline"
                        >
                          {r.saleNumber}
                        </Link>
                      ) : (
                        <span className="text-gray-500">{r.saleNumber}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">{r.customerName ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {r.ttn ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {formatUah(r.amountUah)}
                    </td>
                    <td className="px-4 py-2">
                      {r.verified ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                          <BadgeCheck className="h-3.5 w-3.5" />
                          Перевірено
                          {r.verifiedByName ? ` · ${r.verifiedByName}` : ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Не перевірено
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {r.verified ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => submit([r.id], false)}
                          disabled={isPending}
                        >
                          <RotateCcw className="mr-1 h-3.5 w-3.5" />
                          Скасувати
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => submit([r.id], true)}
                          disabled={isPending}
                        >
                          Перевірено
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
