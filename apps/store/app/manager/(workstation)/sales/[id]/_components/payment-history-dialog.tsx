"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  useToast,
} from "@ltex/ui";

interface CashOrderRow {
  id: string;
  type: string; // income | expense
  status: string; // draft | posted
  amountUah: number;
  amountEur: number;
  amountUsd: number;
  amountUahCashless: number;
  changeForId: string | null;
  cashFlowArticle: string | null;
  comment: string | null;
  createdAt: string;
}

interface HistoryResponse {
  dueUah: number;
  summary: { receivedUah: number; changeUah: number; balanceUah: number };
  orders: CashOrderRow[];
}

function uah(n: number): string {
  return `${Math.round(n).toLocaleString("uk-UA")} ₴`;
}

/** Ненульові суми ордера як «50 € · 200 ₴ (безнал)». */
function amountParts(o: CashOrderRow): string {
  const parts: string[] = [];
  if (o.amountUah) parts.push(`${o.amountUah.toLocaleString("uk-UA")} ₴`);
  if (o.amountUahCashless)
    parts.push(`${o.amountUahCashless.toLocaleString("uk-UA")} ₴ (безнал)`);
  if (o.amountEur) parts.push(`${o.amountEur.toFixed(2)} €`);
  if (o.amountUsd) parts.push(`${o.amountUsd.toFixed(2)} $`);
  return parts.length ? parts.join(" · ") : "—";
}

/**
 * Історія оплат по реалізації: список касових ордерів + зведення + видалення
 * документа оплати. Видалення реверсить рухи (борг/ДДС) на сервері.
 */
export function PaymentHistoryDialog({
  open,
  onOpenChange,
  saleId,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string | null;
  /** Викликається після видалення оплати (щоб оновити суми документа). */
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!saleId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/manager/sales/${saleId}/cash-orders`);
      if (!res.ok) {
        setError(`Помилка ${res.status}`);
        return;
      }
      setData((await res.json()) as HistoryResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка завантаження");
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    if (open && saleId) void load();
  }, [open, saleId, load]);

  async function remove(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/v1/manager/cash-orders/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          description: j.error ?? "Не вдалось видалити оплату",
          variant: "destructive",
        });
        return;
      }
      toast({ description: "Оплату видалено ✓" });
      setConfirmId(null);
      await load();
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  }

  const orders = data?.orders ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Історія оплат</DialogTitle>
          <DialogDescription>
            Оплати (касові ордери) по цій реалізації. Тут можна видалити
            помилковий документ оплати.
          </DialogDescription>
        </DialogHeader>

        {data && (
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <Stat label="До оплати" value={uah(data.dueUah)} />
            <Stat label="Отримано" value={uah(data.summary.receivedUah)} />
            <Stat
              label={data.summary.balanceUah >= 0 ? "Залишок" : "Переплата"}
              value={uah(Math.abs(data.summary.balanceUah))}
            />
          </dl>
        )}

        {loading && <p className="text-sm text-gray-500">Завантаження…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && orders.length === 0 && (
          <p className="text-sm text-gray-500">Оплат ще немає.</p>
        )}

        {orders.length > 0 && (
          <div className="space-y-2">
            {orders.map((o) => (
              <div
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        o.type === "expense"
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {o.type === "expense" ? "Розхід (здача)" : "Прихід"}
                    </span>
                    <span className="font-medium text-gray-800">
                      {amountParts(o)}
                    </span>
                    {o.status !== "posted" && (
                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Чернетка
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {new Date(o.createdAt).toLocaleString("uk-UA")}
                    {o.cashFlowArticle ? ` · ${o.cashFlowArticle}` : ""}
                  </div>
                </div>
                {confirmId === o.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">Видалити?</span>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyId === o.id}
                      onClick={() => void remove(o.id)}
                      className="bg-red-600 text-white hover:bg-red-700"
                    >
                      Так
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === o.id}
                      onClick={() => setConfirmId(null)}
                    >
                      Ні
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmId(o.id)}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Видалити
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="mt-0.5 font-semibold text-gray-900">{value}</div>
    </div>
  );
}
