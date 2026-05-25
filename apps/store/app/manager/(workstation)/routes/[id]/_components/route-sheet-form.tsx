"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, RefreshCw, MapPin } from "lucide-react";
import { Button } from "@ltex/ui";
import {
  ROUTE_SHEET_STATUS_META,
  getAllowedRouteSheetTransitions,
  isRouteSheetLocked,
} from "@/lib/manager/route-sheet-status";
import { getSaleStatusMeta } from "@/lib/manager/sale-status";
import { RouteSheetStatusBadge } from "../../_components/route-sheet-status-badge";
import { OrderPickerModal } from "./order-picker-modal";
import { TaskClientPicker } from "./task-client-picker";
import { BarcodeInput } from "../../../sales/new/_components/barcode-input";

/** Підписи на кнопках статус-переходів. */
const TRANSITION_LABEL: Record<string, string> = {
  dispatched: "Відправити",
  completed: "Завершити",
  draft: "Повернути в роботу",
};

/** Best-effort GPS-знімок. Ніколи не кидає — denial/unsupported → null. */
async function captureGps(): Promise<{ lat: number; lng: number } | null> {
  if (
    typeof navigator === "undefined" ||
    !("geolocation" in navigator) ||
    !navigator.geolocation
  ) {
    return null;
  }
  return new Promise((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60_000 },
      );
    } catch {
      resolve(null);
    }
  });
}

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

export interface RouteSheetLoadingView {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  productId: string;
  productName: string | null;
  articleCode: string | null;
  lotId: string;
  barcode: string;
  unit: string | null;
  quantity: number;
  weight: number;
  price: number;
  sum: number;
  pricePerKg: number;
  loaded: boolean;
  isReturn: boolean;
}

export interface RouteSheetShortageView {
  orderId: string | null;
  orderNumber: string | null;
  productId: string;
  productName: string | null;
  articleCode: string | null;
  shortage: number;
}

export interface RouteSheetCountersView {
  ordersCount: number;
  orderedQty: number;
  loadedQty: number;
  shortageQty: number;
}

/** Рядок вкладки «Реалізації» (Sale, derived з routeSheetId). */
export interface RouteSheetSaleView {
  id: string;
  docNumber: number;
  code1C: string | null;
  status: string;
  customerId: string;
  customerName: string | null;
  orderId: string | null;
  totalEur: number;
  totalUah: number;
}

/** Рядок вкладки «Продажи» (SaleItem реалізацій МЛ). */
export interface RouteSheetSaleItemView {
  id: string;
  saleId: string;
  saleNumber: number;
  customerName: string | null;
  productId: string;
  productName: string | null;
  articleCode: string | null;
  lotId: string | null;
  barcode: string | null;
  quantity: number;
  weight: number;
  pricePerKg: number;
  priceEur: number;
}

/** Рядок вкладки «Оплати» (MgrCashOrder, derived з routeSheetId). */
export interface RouteSheetPaymentView {
  id: string;
  docNumber: number;
  type: string;
  customerId: string | null;
  customerName: string | null;
  saleId: string | null;
  documentSumEur: number;
}

/** Рядок вкладки «Завдання» (вільна нотатка клієнт+коментар). */
export interface RouteSheetTaskView {
  id: string;
  customerId: string | null;
  customerName: string | null;
  comment: string;
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
  mileageStartKm: number | null;
  mileageEndKm: number | null;
  gpsLat: number | null;
  gpsLng: number | null;
  /** М'яке попередження про незакритий кілометраж попередньої зміни. */
  mileageWarning: string | null;
  orders: RouteSheetOrderView[];
  items: RouteSheetItemView[];
  loading: RouteSheetLoadingView[];
  shortage: RouteSheetShortageView[];
  counters: RouteSheetCountersView;
  sales: RouteSheetSaleView[];
  saleItems: RouteSheetSaleItemView[];
  payments: RouteSheetPaymentView[];
  tasks: RouteSheetTaskView[];
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

/** Колір бейджа статусу sale → tailwind-класи. */
const SALE_STATUS_BADGE: Record<string, string> = {
  gray: "bg-gray-100 text-gray-700",
  blue: "bg-blue-100 text-blue-700",
  green: "bg-green-100 text-green-700",
  red: "bg-red-100 text-red-700",
};

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
  const [loading, setLoading] = useState<RouteSheetLoadingView[]>(
    initial.loading,
  );
  const [shortage, setShortage] = useState<RouteSheetShortageView[]>(
    initial.shortage,
  );
  const [counters, setCounters] = useState<RouteSheetCountersView>(
    initial.counters,
  );
  const [sales, setSales] = useState<RouteSheetSaleView[]>(initial.sales);
  const [saleItems, setSaleItems] = useState<RouteSheetSaleItemView[]>(
    initial.saleItems,
  );
  const [payments, setPayments] = useState<RouteSheetPaymentView[]>(
    initial.payments,
  );
  const [totalEur, setTotalEur] = useState(initial.totalEur);
  const [totalUah, setTotalUah] = useState(initial.totalUah);

  const [tasks, setTasks] = useState<RouteSheetTaskView[]>(initial.tasks);
  const [mileageStartKm, setMileageStartKm] = useState(
    initial.mileageStartKm != null ? String(initial.mileageStartKm) : "",
  );
  const [mileageEndKm, setMileageEndKm] = useState(
    initial.mileageEndKm != null ? String(initial.mileageEndKm) : "",
  );
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(
    initial.gpsLat != null && initial.gpsLng != null
      ? { lat: initial.gpsLat, lng: initial.gpsLng }
      : null,
  );
  const [mileageWarning] = useState<string | null>(initial.mileageWarning);
  const [transitionNote, setTransitionNote] = useState<string | null>(null);

  // Чернетка нового завдання (вкладка Завдання).
  const [taskClientId, setTaskClientId] = useState<string | null>(null);
  const [taskClientName, setTaskClientName] = useState<string | null>(null);
  const [taskComment, setTaskComment] = useState("");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  const locked = isRouteSheetLocked(status);
  const allowedTransitions = getAllowedRouteSheetTransitions(status);

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

  /**
   * Статус-перехід. На `dispatched`/`completed` — best-effort GPS-знімок +
   * м'яке попередження про відсутній кілометраж. GPS-збій ніколи не блокує.
   */
  async function doTransition(next: string) {
    const prev = status;
    setTransitionNote(null);
    setStatus(next);
    setSaving(true);

    const patch: Record<string, unknown> = { status: next };

    if (next === "dispatched" || next === "completed") {
      const coords = await captureGps();
      if (coords) {
        patch.gpsLat = coords.lat;
        patch.gpsLng = coords.lng;
      }
      // М'яке попередження про кілометраж (не блокує перехід).
      if (next === "dispatched" && !mileageStartKm) {
        setTransitionNote(
          "Не вказано початковий кілометраж зміни. Перехід виконано — заповніть кілометраж у шапці.",
        );
      }
      if (next === "completed" && !mileageEndKm) {
        setTransitionNote(
          "Не вказано кінцевий кілометраж зміни. Перехід виконано — заповніть кілометраж у шапці.",
        );
      }
    }

    try {
      const ok = await patchHeader(patch);
      if (!ok) {
        setStatus(prev);
        setTransitionNote(null);
        return;
      }
      if (patch.gpsLat != null && patch.gpsLng != null) {
        setGps({ lat: patch.gpsLat as number, lng: patch.gpsLng as number });
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  /** Перезавантажує МЛ (orders/items/loading/shortage/totals) з сервера. */
  const reloadSheet = useCallback(async () => {
    const res = await fetch(`/api/v1/manager/route-sheets/${sheetId}`);
    if (!res.ok) return;
    const data = (await res.json()) as { sheet: RouteSheetView };
    setOrders(data.sheet.orders);
    setItems(data.sheet.items);
    setLoading(data.sheet.loading);
    setShortage(data.sheet.shortage);
    setCounters(data.sheet.counters);
    setSales(data.sheet.sales);
    setSaleItems(data.sheet.saleItems);
    setPayments(data.sheet.payments);
    setTotalEur(data.sheet.totalEur);
    setTotalUah(data.sheet.totalUah);
  }, [sheetId]);

  /** Скан/ручний ввід ШК → POST рядка Загрузки + оптимістичне оновлення. */
  const addLoadingByBarcode = useCallback(
    async (code: string) => {
      setBarcodeError(null);
      setError(null);
      try {
        const res = await fetch(
          `/api/v1/manager/route-sheets/${sheetId}/loading`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ barcode: code }),
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setBarcodeError(body.error ?? `Помилка ${res.status}`);
          return;
        }
        await reloadSheet();
      } catch (e) {
        setBarcodeError((e as Error).message ?? "Невідома помилка");
      }
    },
    [sheetId, reloadSheet],
  );

  /** Видаляє рядок Загрузки. */
  async function removeLoadingRow(loadingId: string) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/v1/manager/route-sheets/${sheetId}/loading?loadingId=${encodeURIComponent(
          loadingId,
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

  /** Toggle прапорця (loaded/isReturn) рядка Загрузки. */
  async function patchLoadingRow(
    loadingId: string,
    patch: { loaded?: boolean; isReturn?: boolean },
  ) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/v1/manager/route-sheets/${sheetId}/loading?loadingId=${encodeURIComponent(
          loadingId,
        )}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
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

  /** Додати завдання (вільна нотатка клієнт+коментар). */
  async function addTask() {
    const comment = taskComment.trim();
    if (!comment) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/manager/route-sheets/${sheetId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: taskClientId, comment }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Помилка ${res.status}`);
        return;
      }
      const { task } = (await res.json()) as { task: RouteSheetTaskView };
      setTasks((prev) => [...prev, task]);
      setTaskClientId(null);
      setTaskClientName(null);
      setTaskComment("");
    } finally {
      setSaving(false);
    }
  }

  /** Видалити завдання. */
  async function removeTask(taskId: string) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/v1/manager/route-sheets/${sheetId}/tasks?taskId=${encodeURIComponent(
          taskId,
        )}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Помилка ${res.status}`);
        return;
      }
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
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

  // Анти-дубль (м'який): множина orderId, для яких уже є реалізація на цьому МЛ.
  const orderIdsWithSale = useMemo(() => {
    const set = new Set<string>();
    for (const s of sales) if (s.orderId) set.add(s.orderId);
    return set;
  }, [sales]);

  return (
    <div className="space-y-5">
      {/* ─── Шапка ──────────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Маршрутний лист
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <RouteSheetStatusBadge status={status} />
            {allowedTransitions.map((next) => (
              <Button
                key={next}
                type="button"
                size="sm"
                disabled={saving}
                variant={next === "draft" ? "outline" : "default"}
                onClick={() => void doTransition(next)}
                className={
                  next === "draft"
                    ? ""
                    : "bg-green-600 text-white hover:bg-green-700"
                }
              >
                {TRANSITION_LABEL[next] ?? ROUTE_SHEET_STATUS_META[next].label}
              </Button>
            ))}
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
              Кілометраж (початок)
            </label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={mileageStartKm}
              disabled={locked}
              onChange={(e) => setMileageStartKm(e.target.value)}
              onBlur={() =>
                void patchHeader({
                  mileageStartKm:
                    mileageStartKm === "" ? null : Number(mileageStartKm),
                })
              }
              placeholder="км"
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Кілометраж (кінець)
            </label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={mileageEndKm}
              disabled={locked}
              onChange={(e) => setMileageEndKm(e.target.value)}
              onBlur={() =>
                void patchHeader({
                  mileageEndKm:
                    mileageEndKm === "" ? null : Number(mileageEndKm),
                })
              }
              placeholder="км"
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
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

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t pt-3 text-sm">
          {gps ? (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <MapPin className="h-3.5 w-3.5" />
              GPS: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
            </span>
          ) : (
            <span />
          )}
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

        {mileageWarning && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ⚠ {mileageWarning}
          </p>
        )}

        {transitionNote && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {transitionNote}
          </p>
        )}

        {locked && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Маршрутний лист завершено — редагування заборонено. Скористайтесь
            кнопкою «Повернути в роботу», щоб розблокувати.
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

      {/* ─── Загрузка (скан) ─────────────────────────────────────────────── */}
      {tab === "loading" && (
        <section className="space-y-3">
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">
              Сканування лотів ({loading.length})
            </h3>
            <BarcodeInput
              onCode={(c) => void addLoadingByBarcode(c)}
              error={barcodeError}
              disabled={locked}
            />
            <p className="mt-2 text-xs text-gray-400">
              Скануйте камерою або введіть ШК. Кожен лот (мішок) додається один
              раз; він автоматично прив'язується до замовлення за товаром.
            </p>
          </div>

          {loading.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center text-sm text-gray-500">
              Лотів ще не завантажено. Відскануйте перший ШК.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-gray-500">
                    <th className="px-3 py-2 font-medium">Клієнт</th>
                    <th className="px-3 py-2 font-medium">Замовлення</th>
                    <th className="px-3 py-2 font-medium">Артикул</th>
                    <th className="px-3 py-2 font-medium">Лот (ШК)</th>
                    <th className="px-3 py-2 text-right font-medium">Вага</th>
                    <th className="px-3 py-2 text-right font-medium">К-сть</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Сума, €
                    </th>
                    <th className="px-3 py-2 text-center font-medium">
                      Заванта&shy;жено
                    </th>
                    <th className="px-3 py-2 text-center font-medium">
                      Повер&shy;нення
                    </th>
                    <th className="w-10 px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-b last:border-b-0 ${
                        row.isReturn ? "bg-amber-50" : ""
                      }`}
                    >
                      <td className="px-3 py-2 text-gray-800">
                        {row.customerName ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-600">
                        {row.orderNumber ? `№${row.orderNumber}` : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-600">
                        {row.articleCode ?? "—"}
                      </td>
                      <td className="min-w-0 px-3 py-2">
                        <div className="break-all font-mono text-xs text-gray-900">
                          {row.barcode}
                        </div>
                        <div className="truncate text-xs text-gray-400">
                          {row.productName ?? row.productId}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {row.weight.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {row.quantity}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {row.sum.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={row.loaded}
                          disabled={locked || saving}
                          onChange={(e) =>
                            void patchLoadingRow(row.id, {
                              loaded: e.target.checked,
                            })
                          }
                          className="h-4 w-4 shrink-0 rounded border-gray-300 text-green-600 focus:ring-green-500"
                          aria-label="Завантажено"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={row.isReturn}
                          disabled={locked || saving}
                          onChange={(e) =>
                            void patchLoadingRow(row.id, {
                              isReturn: e.target.checked,
                            })
                          }
                          className="h-4 w-4 shrink-0 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                          aria-label="Повернення"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          disabled={locked || saving}
                          onClick={() => void removeLoadingRow(row.id)}
                          className="inline-flex shrink-0 items-center text-red-500 hover:text-red-700 disabled:opacity-40"
                          aria-label="Прибрати рядок завантаження"
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

      {/* ─── Бракує (нестача) ─────────────────────────────────────────────── */}
      {tab === "shortage" && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Бракує (нестача на складі)
          </h3>
          {shortage.length === 0 ? (
            <div className="rounded-lg border border-dashed border-green-200 bg-green-50 px-6 py-8 text-center text-sm text-green-700">
              Усе завантажено — нестачі немає.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">Замовлення</th>
                    <th className="px-4 py-2 font-medium">Артикул</th>
                    <th className="px-4 py-2 font-medium">Товар</th>
                    <th className="px-4 py-2 text-right font-medium">
                      Кількість нестачі
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shortage.map((s, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="px-4 py-2 font-mono text-gray-600">
                        {s.orderNumber ? `№${s.orderNumber}` : "—"}
                      </td>
                      <td className="px-4 py-2 font-mono text-gray-600">
                        {s.articleCode ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-gray-800">
                        {s.productName ?? s.productId}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-red-600">
                        {s.shortage}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ─── Реалізації ──────────────────────────────────────────────────── */}
      {tab === "sales" && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Реалізації ({sales.length})
            </h3>
            <Link
              href={`/manager/sales/new?routeSheetId=${encodeURIComponent(
                sheetId,
              )}`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Непланова реалізація
            </Link>
          </div>

          {/* По кожному замовленню — кнопка «Реалізація» (preset клієнт+замовлення). */}
          {orders.length > 0 && (
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">Замовлення</th>
                    <th className="px-4 py-2 font-medium">Клієнт</th>
                    <th className="w-44 px-4 py-2 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const hasSale = orderIdsWithSale.has(o.orderId);
                    const clientParam = o.customerId
                      ? `&clientId=${encodeURIComponent(o.customerId)}`
                      : "";
                    return (
                      <tr key={o.id} className="border-b last:border-b-0">
                        <td className="px-4 py-2 font-mono text-gray-700">
                          {o.orderNumber ? `№${o.orderNumber}` : "—"}
                        </td>
                        <td className="px-4 py-2 text-gray-800">
                          {o.customerName ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {hasSale && (
                            <span className="mr-2 text-xs text-gray-400">
                              вже є реалізація
                            </span>
                          )}
                          <Link
                            href={`/manager/sales/new?routeSheetId=${encodeURIComponent(
                              sheetId,
                            )}${clientParam}&orderId=${encodeURIComponent(
                              o.orderId,
                            )}`}
                            className="inline-flex h-8 items-center justify-center rounded-md bg-green-600 px-3 text-xs font-medium text-white hover:bg-green-700"
                          >
                            Реалізація
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {sales.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center text-sm text-gray-500">
              Реалізацій ще немає. Створіть реалізацію по замовленню або
              непланову.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">№</th>
                    <th className="px-4 py-2 font-medium">Клієнт</th>
                    <th className="px-4 py-2 text-right font-medium">Сума</th>
                    <th className="px-4 py-2 font-medium">Статус</th>
                    <th className="w-20 px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => {
                    const meta = getSaleStatusMeta(s.status);
                    return (
                      <tr key={s.id} className="border-b last:border-b-0">
                        <td className="px-4 py-2 font-mono text-gray-700">
                          №{s.code1C ?? s.docNumber}
                        </td>
                        <td className="px-4 py-2 text-gray-800">
                          {s.customerName ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-700">
                          {Math.round(s.totalUah).toLocaleString("uk-UA")} ₴
                          <span className="ml-1 text-xs text-gray-400">
                            · {s.totalEur.toFixed(2)} €
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                              SALE_STATUS_BADGE[meta.color] ??
                              SALE_STATUS_BADGE.gray
                            }`}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Link
                            href={`/manager/sales/${s.id}`}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800"
                          >
                            Відкрити
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ─── Продажи (порядкова деталізація) ─────────────────────────────── */}
      {tab === "products" && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Продажи ({saleItems.length})
          </h3>
          {saleItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center text-sm text-gray-500">
              Проданих позицій ще немає.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-gray-500">
                    <th className="px-3 py-2 font-medium">Клієнт</th>
                    <th className="px-3 py-2 font-medium">Артикул</th>
                    <th className="px-3 py-2 font-medium">Товар</th>
                    <th className="px-3 py-2 text-right font-medium">К-сть</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Ціна/кг
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Сума, €
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {saleItems.map((it) => (
                    <tr key={it.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2 text-gray-800">
                        {it.customerName ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-600">
                        {it.articleCode ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-800">
                        {it.productName ?? it.productId}
                        {it.barcode && (
                          <span className="ml-1 font-mono text-xs text-gray-400">
                            ({it.barcode})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {it.quantity}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {it.pricePerKg.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {it.priceEur.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ─── Оплати ──────────────────────────────────────────────────────── */}
      {tab === "payments" && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Оплати ({payments.length})
            </h3>
            <Link
              href={`/manager/payments/new?routeSheetId=${encodeURIComponent(
                sheetId,
              )}`}
              className="inline-flex h-9 items-center justify-center rounded-md bg-green-600 px-3 text-sm font-medium text-white hover:bg-green-700"
            >
              <Plus className="mr-1 h-4 w-4" />
              Створити оплату
            </Link>
          </div>

          {payments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center text-sm text-gray-500">
              Оплат ще немає. Створіть оплату по реалізації або клієнту.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">№</th>
                    <th className="px-4 py-2 font-medium">Клієнт</th>
                    <th className="px-4 py-2 font-medium">Вид</th>
                    <th className="px-4 py-2 text-right font-medium">
                      Сума, €
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr
                      key={p.id}
                      className={`border-b last:border-b-0 ${
                        p.type === "expense" ? "bg-amber-50" : ""
                      }`}
                    >
                      <td className="px-4 py-2 font-mono text-gray-700">
                        №{p.docNumber}
                      </td>
                      <td className="px-4 py-2 text-gray-800">
                        {p.customerName ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {p.type === "expense" ? "Розхід (здача)" : "Прихід"}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700">
                        {p.documentSumEur.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ─── Завдання (вільні нотатки) ───────────────────────────────────── */}
      {tab === "tasks" && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Завдання ({tasks.length})
          </h3>

          {!locked && (
            <div className="space-y-3 rounded-lg border bg-white p-4 shadow-sm">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Клієнт (необов&apos;язково)
                </label>
                <TaskClientPicker
                  value={taskClientId}
                  selectedName={taskClientName}
                  onChange={(id, name) => {
                    setTaskClientId(id);
                    setTaskClientName(name);
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Коментар
                </label>
                <textarea
                  value={taskComment}
                  onChange={(e) => setTaskComment(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="Що зробити на маршруті…"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={saving || taskComment.trim().length === 0}
                  onClick={() => void addTask()}
                  className="bg-green-600 text-white hover:bg-green-700"
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Додати
                </Button>
              </div>
            </div>
          )}

          {tasks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center text-sm text-gray-500">
              Завдань ще немає.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">Клієнт</th>
                    <th className="px-4 py-2 font-medium">Коментар</th>
                    <th className="w-12 px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id} className="border-b last:border-b-0">
                      <td className="px-4 py-2 text-gray-800">
                        {t.customerName ?? "—"}
                      </td>
                      <td className="whitespace-pre-wrap px-4 py-2 text-gray-700">
                        {t.comment}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          disabled={locked || saving}
                          onClick={() => void removeTask(t.id)}
                          className="inline-flex items-center text-red-500 hover:text-red-700 disabled:opacity-40"
                          aria-label="Прибрати завдання"
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

      {/* ─── Лічильник (на всіх вкладках) ────────────────────────────────── */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-white px-4 py-2 text-sm shadow-sm">
        <span className="text-gray-500">
          Замовлень:{" "}
          <span className="font-semibold text-gray-800">
            {counters.ordersCount}
          </span>
        </span>
        <span className="text-gray-500">
          замовлено:{" "}
          <span className="font-semibold text-gray-800">
            {counters.orderedQty}
          </span>
        </span>
        <span className="text-gray-500">
          завантажено:{" "}
          <span className="font-semibold text-gray-800">
            {counters.loadedQty}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setTab("shortage")}
          className={`font-medium underline-offset-2 hover:underline ${
            counters.shortageQty > 0 ? "text-red-600" : "text-gray-500"
          }`}
        >
          бракує: <span className="font-semibold">{counters.shortageQty}</span>
        </button>
      </div>

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
