"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@ltex/ui";
import type { DeletionRequestListItem } from "@/lib/manager/deletion-queue";

const ENTITY_LABEL: Record<string, string> = {
  client: "Клієнт",
  order: "Замовлення",
  sale: "Реалізація",
  cash_order: "Оплата",
  route_sheet: "Маршрутний лист",
  dictionary: "Довідник",
  category: "Категорія",
  product: "Товар",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("uk-UA");
}

export function TrashClient({
  items,
  total,
  page,
}: {
  items: DeletionRequestListItem[];
  total: number;
  page: number;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function restore(id: string) {
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/v1/manager/deletions/${id}/restore`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Помилка ${res.status}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message ?? "Невідома помилка");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
        Кошик порожній — немає документів, позначених вами на вилучення.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Тип</th>
              <th className="px-4 py-2 font-medium">Документ</th>
              <th className="px-4 py-2 font-medium">Причина</th>
              <th className="px-4 py-2 font-medium">Позначено</th>
              <th className="w-28 px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="px-4 py-2 text-gray-500">
                  {ENTITY_LABEL[r.entityType] ?? r.entityType}
                </td>
                <td className="px-4 py-2 font-medium text-gray-800">
                  {r.entityLabel}
                </td>
                <td className="px-4 py-2 text-gray-600">{r.reason}</td>
                <td className="px-4 py-2 text-gray-500">
                  {formatDate(r.requestedAt)}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyId === r.id}
                    onClick={() => void restore(r.id)}
                  >
                    {busyId === r.id ? "…" : "Повернути"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">Усього: {total}</p>
    </div>
  );
}
