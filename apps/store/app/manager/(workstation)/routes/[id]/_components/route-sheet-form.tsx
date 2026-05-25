"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@ltex/ui";
import {
  ROUTE_SHEET_STATUS_LIST,
  ROUTE_SHEET_STATUS_META,
  isRouteSheetLocked,
} from "@/lib/manager/route-sheet-status";
import { RouteSheetStatusBadge } from "../../_components/route-sheet-status-badge";
import { OrderPickerModal } from "./order-picker-modal";

export interface RouteOption {
  id: string;
  name: string;
}
export interface ExpeditorOption {
  id: string;
  fullName: string;
}

export interface RouteSheetOrderView {
  id: string;
  orderId: string;
  orderNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  city: string | null;
}

export interface RouteSheetItemView {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  productId: string;
  productName: string | null;
  articleCode: string | null;
  lotId: string | null;
  barcode: string | null;
  unit: string | null;
  quantity: number;
  price: number;
  sum: number;
  quantityLoaded: number;
}

export interface RouteSheetView {
  id: string;
  displayNumber: string;
  date: string;
  arrivalDate: string | null;
  status: string;
  routeId: string | null;
  expeditorUserId: string | null;
  comment: string | null;
  totalEur: number;
  totalUah: number;
  orders: RouteSheetOrderView[];
  items: RouteSheetItemView[];
}

const TABS = [
  { id: "orders", label: "Заказы" },
  { id: "items", label: "Товари" },
  { id: "loading", label: "Загрузка" },
  { id: "sales", label: "Реалізації" },
  { id: "products", label: "Продажи" },
  { id: "payments", label: "Оплати" },
  { id: "shortage", label: "Бракує" },
  { id: "tasks", label: "Завдання" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Вкладки наступних етапів — поки заглушки (Етапи 2-4). */
const PLACEHOLDER_TABS = new Set<TabId>([
  "loading",
  "sales",
  "products",
  "payments",
  "shortage",
  "tasks",
]);

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function RouteSheetForm({
  initial,
  routes,
  expeditors,
}: {
  initial: RouteSheetView;
  routes: RouteOption[];
  expeditors: ExpeditorOption[];
}) {
  const router = useRouter();
  const sheetId = initial.id;

  const [tab, setTab] = useState<TabId>("orders");
  const [status, setStatus] = useState(initial.status);
  const [date, setDate] = useState(toDateInput(initial.date));
  const [arrivalDate, setArrivalDate] = useState(
    toDateInput(initial.arrivalDate),
  );
  const [routeId, setRouteId] = useState(initial.routeId ?? "");
  const [expeditorUserId, setExpeditorUserId] = useState(
    initial.expeditorUserId ?? "",
  );
  const [comment, setComment] = useState(initial.comment ?? "");

  const [orders, setOrders] = useState<RouteSheetOrderView[]>(initial.orders);
  const [items, setItems] = useState<RouteSheetItemView[]>(initial.items);
  const [totalEur, setTotalEur] = useState(initial.totalEur);
  const [totalUah, setTotalUah] = useState(initial.totalUah);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = isRouteSheetLocked(status);

  /** PATCH одного поля шапки (autosave on blur/change). */
  const patchHeader = useCallback(
    async (patch: Record<string, unknown>) => {
      setError(null);
      try {
        const res = await fetch(`/api/v1/manager/route-sheets/${sheetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(body.error ?? `Помилка ${res.status}`);
          return false;
        }
        return true;
      } catch (e) {
        setError((e as Error).message ?? "Невідома помилка");
        return false;
      }
    },
    [sheetId],
  );

  async function onStatusChange(next: string) {
    const prev = status;
    setStatus(next);
    const ok = await patchHeader({ status: next });
    if (!ok) {
      setStatus(prev);
    } else {
      router.refresh();
    }
  }

  /** Перезавантажує МЛ (orders/items/totals) з сервера. */
  const reloadSheet = useCallback(async () => {
    const res = await fetch(`/api/v1/manager/route-sheets/${sheetId}`);
    if (!res.ok) return;
    const data = (await res.json()) as { sheet: RouteSheetView };
    setOrders(data.sheet.orders);
    setItems(data.sheet.items);
    setTotalEur(data.sheet.totalEur);
    setTotalUah(data.sheet.totalUah);
  }, [sheetId]);

  async function addOrders(orderIds: string[]) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/v1/manager/route-sheets/${sheetId}/orders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderIds }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Помилка ${res.status}`);
        return;
      }
      await reloadSheet();
    } finally {
      setSaving(false);
    }
  }

  async function removeOrder(orderId: string) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/v1/manager/route-sheets/${sheetId}/orders?orderId=${encodeURIComponent(
          orderId,
        )}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Помилка ${res.status}`);
        return;
      }
      await reloadSheet();
    } finally {
      setSaving(false);
    }
  }

  async function refillItems() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/v1/manager/route-sheets/${sheetId}/refill-items`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Помилка ${res.status}`);
        return;
      }
      await reloadSheet();
    } finally {
      setSaving(false);
    }
  }

  // Дерево товарів по замовленню (вкладка Товари).
  const itemsByOrder = useMemo(() => {
    const groups = new Map<
      string,
      { label: string; rows: RouteSheetItemView[]; sum: number }
    >();
    for (const it of items) {
      const key = it.orderId ?? "—";
      const label =
        (it.orderNumber ? `№${it.orderNumber}` : "Без замовлення") +
        (it.customerName ? ` · ${it.customerName}` : "");
      const g = groups.get(key) ?? { label, rows: [], sum: 0 };
      g.rows.push(it);
      g.sum += it.sum;
      groups.set(key, g);
    }
    return [...groups.values()];
  }, [items]);

  return (
    <div className="space-y-5">
      {/* ─── Шапка ──────────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Маршрутний лист
          </h2>
          <div className="flex items-center gap-2">
            <RouteSheetStatusBadge status={status} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Дата
            </label>
            <input
              type="date"
              value={date}
              disabled={locked}
              onChange={(e) => setDate(e.target.value)}
              onBlur={() =>
                date && void patchHeader({ date: `${date}T00:00:00.000Z` })
              }
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Дата приїзду
            </label>
            <input
              type="date"
              value={arrivalDate}
              disabled={locked}
              onChange={(e) => setArrivalDate(e.target.value)}
              onBlur={() =>
                void patchHeader({
                  arrivalDate: arrivalDate
                    ? `${arrivalDate}T00:00:00.000Z`
                    : null,
                })
              }
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Маршрут
            </label>
            <select
              value={routeId}
              disabled={locked}
              onChange={(e) => {
                setRouteId(e.target.value);
                void patchHeader({ routeId: e.target.value || null });
              }}
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="">— Не вибрано —</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Експедитор
            </label>
            <select
              value={expeditorUserId}
              disabled={locked}
              onChange={(e) => {
                setExpeditorUserId(e.target.value);
                void patchHeader({ expeditorUserId: e.target.value || null });
              }}
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="">— Не вибрано —</option>
              {expeditors.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Статус
            </label>
            <select
              value={status}
              onChange={(e) => void onStatusChange(e.target.value)}
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              {ROUTE_SHEET_STATUS_LIST.map((s) => (
                <option key={s} value={s}>
                  {ROUTE_SHEET_STATUS_META[s].label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0 sm:col-span-2 lg:col-span-3">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Коментар
            </label>
            <textarea
              value={comment}
              disabled={locked}
              onChange={(e) => setComment(e.target.value)}
              onBlur={() => void patchHeader({ comment: comment || null })}
              rows={2}
              maxLength={2000}
              placeholder="Нотатка до маршруту (необов'язково)"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-4 border-t pt-3 text-sm">
          <span className="text-gray-500">
            Сума:{" "}
            <span className="font-semibold text-gray-800">
              {Math.round(totalUah).toLocaleString("uk-UA")} ₴
            </span>{" "}
            ·{" "}
            <span className="font-semibold text-gray-800">
              {totalEur.toFixed(2)} €
            </span>
          </span>
        </div>

        {locked && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Маршрутний лист завершено — редагування заборонено. Змініть статус,
            щоб розблокувати.
          </p>
        )}
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ─── Вкладки ─────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto border-b">
        <div className="flex min-w-max gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Заказы ──────────────────────────────────────────────────────── */}
      {tab === "orders" && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Замовлення ({orders.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/manager/orders/new"
                className="inline-flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Створити замовлення
              </Link>
              <Button
                type="button"
                size="sm"
                disabled={locked || saving}
                onClick={() => setPickerOpen(true)}
                className="bg-green-600 text-white hover:bg-green-700"
              >
                <Plus className="mr-1 h-4 w-4" />
                Додати замовлення
              </Button>
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center text-sm text-gray-500">
              Замовлень ще немає. Додайте наявні замовлення до маршруту.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">№</th>
                    <th className="px-4 py-2 font-medium">Клієнт</th>
                    <th className="px-4 py-2 font-medium">Місто</th>
                    <th className="w-12 px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b last:border-b-0">
                      <td className="px-4 py-2 font-mono text-gray-700">
                        {o.orderNumber ? (
                          <Link
                            href={`/manager/orders/${o.orderId}`}
                            className="hover:text-blue-600"
                          >
                            №{o.orderNumber}
                          </Link>
                        ) : (
                          <Link
                            href={`/manager/orders/${o.orderId}`}
                            className="hover:text-blue-600"
                          >
                            Відкрити
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-800">
                        {o.customerName ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {o.city ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          disabled={locked || saving}
                          onClick={() => void removeOrder(o.orderId)}
                          className="inline-flex items-center text-red-500 hover:text-red-700 disabled:opacity-40"
                          aria-label="Прибрати замовлення з маршруту"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ─── Товари ──────────────────────────────────────────────────────── */}
      {tab === "items" && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Товари замовлень
            </h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={locked || saving}
              onClick={() => void refillItems()}
            >
              <RefreshCw className="mr-1 h-4 w-4" />
              Заповнити
            </Button>
          </div>

          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center text-sm text-gray-500">
              Товарів немає. Додайте замовлення або натисніть «Заповнити».
            </div>
          ) : (
            <div className="space-y-4">
              {itemsByOrder.map((g, gi) => (
                <div
                  key={gi}
                  className="overflow-x-auto rounded-lg border bg-white"
                >
                  <div className="border-b bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700">
                    {g.label}
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      сума {g.sum.toFixed(2)} €
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="px-4 py-2 font-medium">Артикул</th>
                        <th className="px-4 py-2 font-medium">Товар</th>
                        <th className="px-4 py-2 text-right font-medium">
                          К-сть
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          Ціна, €
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          Сума, €
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((it) => (
                        <tr key={it.id} className="border-b last:border-b-0">
                          <td className="px-4 py-2 font-mono text-gray-600">
                            {it.articleCode ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-gray-800">
                            {it.productName ?? it.productId}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-700">
                            {it.quantity}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-700">
                            {it.price.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-700">
                            {it.sum.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              <div className="flex justify-end text-sm text-gray-600">
                Разом:{" "}
                <span className="ml-2 font-semibold text-gray-800">
                  {totalEur.toFixed(2)} €
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ─── Заглушки наступних етапів ───────────────────────────────────── */}
      {PLACEHOLDER_TABS.has(tab) && (
        <section className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">
            Доступно у наступному етапі
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Ця вкладка зʼявиться у наступних оновленнях маршрутного листа.
          </p>
        </section>
      )}

      <OrderPickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        routeSheetId={sheetId}
        onConfirm={async (ids) => {
          setPickerOpen(false);
          await addOrders(ids);
        }}
      />
    </div>
  );
}
