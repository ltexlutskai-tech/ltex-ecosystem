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
import { useRecordAutosave } from "@/lib/autosave/use-record-autosave";
import {
  AutosaveStatus,
  RestoreDraftBanner,
} from "../../../_components/autosave-status";
import { RouteSheetStatusBadge } from "../../_components/route-sheet-status-badge";
import { OrderPickerModal } from "./order-picker-modal";
import { TaskClientPicker } from "./task-client-picker";
import { LoadingBoard } from "./loading-board";
import type { LoadingBoardOrder } from "@/lib/manager/route-sheet-loading";

/** Підписи на кнопках статус-переходів. */
const TRANSITION_LABEL: Record<string, string> = {
  dispatched: "Відправити",
  completed: "Завершити",
  draft: "Повернути в роботу",
};

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

/** Рядок вкладки «Витрати» (1С таб. частина `Витрати`, VT7334). */
export interface RouteSheetExpenseView {
  id: string;
  articleName: string | null;
  cashFlowArticleId: string | null;
  cashFlowArticleName: string | null;
  currency: string;
  isMileage: boolean;
  amount: number;
}

/** Опція довідника статей витрат (для дропдауна). */
export interface CashFlowArticleOption {
  id: string;
  name: string;
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
  pricePerKm: number | null;
  gpsLat: number | null;
  gpsLng: number | null;
  /** М'яке попередження про незакритий кілометраж попередньої зміни. */
  mileageWarning: string | null;
  orders: RouteSheetOrderView[];
  items: RouteSheetItemView[];
  loading: RouteSheetLoadingView[];
  loadingBoard: LoadingBoardOrder[];
  shortage: RouteSheetShortageView[];
  counters: RouteSheetCountersView;
  sales: RouteSheetSaleView[];
  saleItems: RouteSheetSaleItemView[];
  payments: RouteSheetPaymentView[];
  expenses: RouteSheetExpenseView[];
  tasks: RouteSheetTaskView[];
}

const TABS = [
  { id: "orders", label: "Заказы" },
  { id: "items", label: "Товари" },
  { id: "loading", label: "Загрузка" },
  { id: "sales", label: "Реалізації" },
  { id: "products", label: "Продажи" },
  { id: "payments", label: "Оплати" },
  { id: "expenses", label: "Витрати" },
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

/** ISO → локальна дата для read-only показу; «—» коли порожньо/невалідно. */
function formatDateDisplay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("uk-UA");
}

export function RouteSheetForm({
  initial,
  expeditors,
  cashFlowArticles = [],
}: {
  initial: RouteSheetView;
  /** @deprecated MgrRoute dropdown прибрано — «Маршрут» тепер вільний текст у `comment`. */
  routes?: RouteOption[];
  expeditors: ExpeditorOption[];
  cashFlowArticles?: CashFlowArticleOption[];
}) {
  const router = useRouter();
  const sheetId = initial.id;

  const [tab, setTab] = useState<TabId>("orders");
  const [status, setStatus] = useState(initial.status);
  // «Маршрут» — вільнотекстова назва маршруту (1С: документ = `Комментарий`).
  const [routeName, setRouteName] = useState(initial.comment ?? "");
  const [expeditorUserId, setExpeditorUserId] = useState(
    initial.expeditorUserId ?? "",
  );

  // Дата складання — read-only показ (ставиться при створенні документа).
  const dateDisplay = formatDateDisplay(initial.date);

  // Дата приїзду — редагована (планова дата візиту, задає менеджер).
  const [arrivalDate, setArrivalDate] = useState<string>(
    initial.arrivalDate ? initial.arrivalDate.slice(0, 10) : "",
  );

  const [orders, setOrders] = useState<RouteSheetOrderView[]>(initial.orders);
  const [items, setItems] = useState<RouteSheetItemView[]>(initial.items);
  const [loading, setLoading] = useState<RouteSheetLoadingView[]>(
    initial.loading,
  );
  const [loadingBoard, setLoadingBoard] = useState<LoadingBoardOrder[]>(
    initial.loadingBoard,
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
  // Витрати (Блок Б) — редаговані ручні рядки + авто-рядок пробігу.
  const [expenses, setExpenses] = useState<RouteSheetExpenseView[]>(
    initial.expenses,
  );
  const [totalEur, setTotalEur] = useState(initial.totalEur);
  const [totalUah, setTotalUah] = useState(initial.totalUah);

  const [tasks, setTasks] = useState<RouteSheetTaskView[]>(initial.tasks);
  // GPS — best-effort знімок координат (за наявності).
  const gps =
    initial.gpsLat != null && initial.gpsLng != null
      ? { lat: initial.gpsLat, lng: initial.gpsLng }
      : null;
  const [mileageWarning] = useState<string | null>(initial.mileageWarning);

  // Кілометраж + ціна за км (Блок Б) — редаговані; на blur → PATCH + reload
  // (щоб авто-рядок витрат «Пальне/пробіг» перерахувався).
  const [mileageStartKm, setMileageStartKm] = useState<string>(
    initial.mileageStartKm != null ? String(initial.mileageStartKm) : "",
  );
  const [mileageEndKm, setMileageEndKm] = useState<string>(
    initial.mileageEndKm != null ? String(initial.mileageEndKm) : "",
  );
  const [pricePerKm, setPricePerKm] = useState<string>(
    initial.pricePerKm != null ? String(initial.pricePerKm) : "",
  );

  // Чернетка нового завдання (вкладка Завдання).
  const [taskClientId, setTaskClientId] = useState<string | null>(null);
  const [taskClientName, setTaskClientName] = useState<string | null>(null);
  const [taskComment, setTaskComment] = useState("");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // ─── Автозбереження шапкових полів (План AUTOSAVE_REALTIME_PLAN, рівень
  // «картка/довідник»). Дебаунс + localStorage-буфер + індикатор. Секційні дії
  // (замовлення/завдання/оплати) лишаються окремими явними PATCH-ами.
  const headerDraft = useMemo(
    () => ({
      comment: routeName.trim() ? routeName : null,
      expeditorUserId: expeditorUserId || null,
    }),
    [routeName, expeditorUserId],
  );
  type HeaderDraft = typeof headerDraft;

  const headerAutosave = useRecordAutosave<HeaderDraft>({
    recordKey: `route-sheet-${sheetId}`,
    data: headerDraft,
    enabled: !locked,
    save: async (d) => {
      const ok = await patchHeader(d);
      if (!ok) throw new Error("route sheet header save failed");
    },
  });

  /** Застосувати відновлені з localStorage шапкові поля. */
  function applyHeaderRestore(d: HeaderDraft): void {
    setRouteName(d.comment ?? "");
    setExpeditorUserId(d.expeditorUserId ?? "");
    headerAutosave.acceptRestore();
  }

  /** Статус-перехід (Складається → Відправлений → Завершений). */
  async function doTransition(next: string) {
    const prev = status;
    setStatus(next);
    setSaving(true);

    try {
      const ok = await patchHeader({ status: next });
      if (!ok) {
        setStatus(prev);
        return;
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
    setLoadingBoard(data.sheet.loadingBoard);
    setShortage(data.sheet.shortage);
    setCounters(data.sheet.counters);
    setSales(data.sheet.sales);
    setSaleItems(data.sheet.saleItems);
    setPayments(data.sheet.payments);
    setExpenses(data.sheet.expenses);
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

  /**
   * Зберегти поле кілометражу/ціни за км (Блок Б) — PATCH числа (або null коли
   * порожньо) + reload (щоб авто-рядок витрат «Пальне/пробіг» перерахувався).
   */
  async function saveMileageField(
    field: "mileageStartKm" | "mileageEndKm" | "pricePerKm",
    raw: string,
  ) {
    const trimmed = raw.trim().replace(",", ".");
    const value = trimmed === "" ? null : Number(trimmed);
    if (value != null && !Number.isFinite(value)) return;
    const ok = await patchHeader({ [field]: value });
    if (ok) await reloadSheet();
  }

  /** Зберегти дату приїзду (планова дата візиту) — PATCH (YYYY-MM-DD або null). */
  async function saveArrivalDate(raw: string) {
    const value = raw.trim() === "" ? null : raw.trim();
    await patchHeader({ arrivalDate: value });
  }

  // ── Загрузка (скан ШК складом) ──────────────────────────────────────────
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [autoFilling, setAutoFilling] = useState(false);

  /** Скан/ручний ввід ШК → рядок Загрузки (POST). */
  async function addLoading(barcode: string) {
    const code = barcode.trim();
    if (!code) return;
    setLoadingError(null);
    setSaving(true);
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
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setLoadingError(body.error ?? `Помилка ${res.status}`);
        return;
      }
      await reloadSheet();
    } finally {
      setSaving(false);
    }
  }

  /** Видалити рядок Загрузки (DELETE) + перерахунок. */
  async function removeLoading(loadingId: string) {
    setLoadingError(null);
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
        setLoadingError(body.error ?? `Помилка ${res.status}`);
        return;
      }
      await reloadSheet();
    } finally {
      setSaving(false);
    }
  }

  /** Toggle «Завантажено»/«Повернення» рядка Загрузки (PATCH) + перерахунок. */
  async function patchLoading(
    loadingId: string,
    patch: { loaded?: boolean; isReturn?: boolean },
  ) {
    setLoadingError(null);
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
        setLoadingError(body.error ?? `Помилка ${res.status}`);
        return;
      }
      await reloadSheet();
    } finally {
      setSaving(false);
    }
  }

  /**
   * «Заповнити з вільних лотів» — авто-підбір вільних лотів під замовлені позиції
   * (порт 1С «Заповнити/Подбор» центральної бази, але у нашій системі).
   */
  async function autoFillLoading() {
    setLoadingError(null);
    setAutoFilling(true);
    try {
      const res = await fetch(
        `/api/v1/manager/route-sheets/${sheetId}/loading/auto-fill`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setLoadingError(body.error ?? `Помилка ${res.status}`);
        return;
      }
      await reloadSheet();
    } finally {
      setAutoFilling(false);
    }
  }

  // Чернетка нового ручного рядка витрат (вкладка Витрати).
  const [expArticleId, setExpArticleId] = useState<string>("");
  const [expAmount, setExpAmount] = useState<string>("");

  /** Додати ручний рядок витрат. */
  async function addExpense() {
    const amount = Number(expAmount.trim().replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const article = cashFlowArticles.find((a) => a.id === expArticleId);
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/v1/manager/route-sheets/${sheetId}/expenses`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cashFlowArticleId: expArticleId || null,
            articleName: article?.name ?? null,
            currency: "UAH",
            amount,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Помилка ${res.status}`);
        return;
      }
      const { expense } = (await res.json()) as {
        expense: RouteSheetExpenseView;
      };
      setExpenses((prev) => [...prev, expense]);
      setExpArticleId("");
      setExpAmount("");
    } finally {
      setSaving(false);
    }
  }

  /** Видалити ручний рядок витрат (авто-рядок пробігу не видаляється). */
  async function removeExpense(expenseId: string) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/v1/manager/route-sheets/${sheetId}/expenses?expenseId=${encodeURIComponent(
          expenseId,
        )}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Помилка ${res.status}`);
        return;
      }
      setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
    } finally {
      setSaving(false);
    }
  }

  // Пробіг + сума витрат (обчислювані для показу).
  const mileageKm = useMemo(() => {
    const s = Number(mileageStartKm.replace(",", "."));
    const e = Number(mileageEndKm.replace(",", "."));
    if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 0;
    return Math.round((e - s) * 100) / 100;
  }, [mileageStartKm, mileageEndKm]);

  const expensesTotal = useMemo(
    () => expenses.reduce((acc, e) => acc + e.amount, 0),
    [expenses],
  );

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

        {!locked && headerAutosave.restoreData && (
          <div className="mb-3">
            <RestoreDraftBanner
              onRestore={() =>
                applyHeaderRestore(headerAutosave.restoreData as HeaderDraft)
              }
              onDismiss={headerAutosave.dismissRestore}
            />
          </div>
        )}

        <div className="mb-2 flex justify-end">
          {!locked && (
            <AutosaveStatus
              status={headerAutosave.status}
              savedAt={headerAutosave.savedAt}
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Маршрут — вільнотекстова назва (1С: документ = Комментарий). */}
          <div className="min-w-0 sm:col-span-2 lg:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Маршрут
            </label>
            <input
              type="text"
              value={routeName}
              disabled={locked}
              onChange={(e) => setRouteName(e.target.value)}
              maxLength={2000}
              placeholder="Напр. 11-12.02.26 Житомир-Вінниця"
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {/* Експедитор — редагований select. */}
          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Експедитор
            </label>
            <select
              value={expeditorUserId}
              disabled={locked}
              onChange={(e) => setExpeditorUserId(e.target.value)}
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

          {/* Дата — read-only (присвоюється при створенні). */}
          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Дата
            </label>
            <p className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
              {dateDisplay}
            </p>
          </div>

          {/* Дата приїзду — редагована (планова дата візиту). */}
          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Дата приїзду
            </label>
            <input
              type="date"
              value={arrivalDate}
              disabled={locked}
              onChange={(e) => setArrivalDate(e.target.value)}
              onBlur={(e) => void saveArrivalDate(e.target.value)}
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {/* Кілометраж + ціна за км — редаговані (Блок Б). */}
          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Кілометраж (початок)
            </label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={mileageStartKm}
              disabled={locked}
              onChange={(e) => setMileageStartKm(e.target.value)}
              onBlur={(e) =>
                void saveMileageField("mileageStartKm", e.target.value)
              }
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm disabled:bg-gray-50 disabled:text-gray-500"
              placeholder="км"
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
              value={mileageEndKm}
              disabled={locked}
              onChange={(e) => setMileageEndKm(e.target.value)}
              onBlur={(e) =>
                void saveMileageField("mileageEndKm", e.target.value)
              }
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm disabled:bg-gray-50 disabled:text-gray-500"
              placeholder="км"
            />
          </div>

          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Ціна за км, ₴
            </label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={pricePerKm}
              disabled={locked}
              onChange={(e) => setPricePerKm(e.target.value)}
              onBlur={(e) =>
                void saveMileageField("pricePerKm", e.target.value)
              }
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm disabled:bg-gray-50 disabled:text-gray-500"
              placeholder="₴/км"
            />
          </div>

          <div className="min-w-0">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Пробіг
            </label>
            <p className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
              {mileageKm > 0 ? `${mileageKm.toLocaleString("uk-UA")} км` : "—"}
            </p>
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
            {expensesTotal > 0 && (
              <>
                Витрати:{" "}
                <span className="font-semibold text-gray-800">
                  {Math.round(expensesTotal).toLocaleString("uk-UA")} ₴
                </span>{" "}
                ·{" "}
              </>
            )}
            Сума:{" "}
            <span className="font-semibold text-gray-800">
              {totalEur.toFixed(2)} €
            </span>{" "}
            ·{" "}
            <span className="text-xs text-gray-400">
              {Math.round(totalUah).toLocaleString("uk-UA")} ₴
            </span>
          </span>
        </div>

        {mileageWarning && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ⚠ {mileageWarning}
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

      {/* ─── Загрузка (дошка складу — order-tree нашої системи) ───────────── */}
      {tab === "loading" && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Завантаження
            </h3>
            <Link
              href={`/manager/routes/${sheetId}/loading`}
              className="inline-flex h-8 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Екран складу ↗
            </Link>
          </div>
          <p className="text-xs text-gray-500">
            Перегляд стану завантаження. Скан і додавання мішків — на «Екрані
            складу».
          </p>
          <LoadingBoard
            board={loadingBoard}
            loading={loading}
            counters={counters}
            locked={locked}
            createSaleHrefFor={(g) =>
              g.orderId
                ? `/manager/sales/new?routeSheetId=${encodeURIComponent(
                    sheetId,
                  )}${
                    g.customerId
                      ? `&clientId=${encodeURIComponent(g.customerId)}`
                      : ""
                  }&orderId=${encodeURIComponent(g.orderId)}`
                : null
            }
          />
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
                          {s.totalEur.toFixed(2)} €
                          <span className="ml-1 text-xs text-gray-400">
                            · {Math.round(s.totalUah).toLocaleString("uk-UA")} ₴
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

      {/* ─── Витрати (редаговані ручні рядки + авто-рядок пробігу) ─────────── */}
      {tab === "expenses" && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Витрати ({expenses.length})
          </h3>

          {!locked && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-white p-4 shadow-sm">
              <div className="min-w-[180px] flex-1">
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Стаття витрат
                </label>
                <select
                  value={expArticleId}
                  onChange={(e) => setExpArticleId(e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-300 px-2 text-sm"
                >
                  <option value="">— без статті —</option>
                  {cashFlowArticles.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-32">
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Сума, ₴
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                  placeholder="0"
                />
              </div>
              <button
                type="button"
                onClick={() => void addExpense()}
                disabled={saving || !expAmount.trim()}
                className="h-10 rounded-md bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Додати
              </button>
            </div>
          )}

          {expenses.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center text-sm text-gray-500">
              Витрат ще немає.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">Стаття</th>
                    <th className="px-4 py-2 text-right font-medium">
                      Сума, ₴
                    </th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-b last:border-b-0">
                      <td className="px-4 py-2 text-gray-800">
                        {e.cashFlowArticleName ?? e.articleName ?? "—"}
                        {e.isMileage && (
                          <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                            авто · пробіг
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700">
                        {Math.round(e.amount).toLocaleString("uk-UA")}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {!e.isMileage && !locked && (
                          <button
                            type="button"
                            onClick={() => void removeExpense(e.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Видалити
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-4 py-2 text-gray-700">Разом</td>
                    <td className="px-4 py-2 text-right text-gray-800">
                      {Math.round(expensesTotal).toLocaleString("uk-UA")}
                    </td>
                    <td />
                  </tr>
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
