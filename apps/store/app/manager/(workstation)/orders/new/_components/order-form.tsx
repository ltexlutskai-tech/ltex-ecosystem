"use client";

import { useCallback, useMemo, useState } from "react";
import { openManagerTab } from "../../../_components/open-manager-tab";
import { useRouter } from "next/navigation";
import { MessageSquare, ListPlus } from "lucide-react";
import { isOrderLocked } from "@/lib/manager/order-status";
import { useDocumentAutosave } from "@/lib/autosave/use-document-autosave";
import {
  AutosaveStatus,
  RestoreDraftBanner,
} from "../../../_components/autosave-status";
import {
  Button,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@ltex/ui";
import { ClientPicker } from "./client-picker";
import { ItemsEditor } from "./items-editor";
import { OrderTotals } from "./order-totals";
import { ProductPricePicker } from "./product-price-picker";
import {
  unitPriceForType,
  autoUnitPrice,
  SELLING_PRICE_TYPES,
} from "@/lib/manager/order-pricing";
import { bagWeightForQuantity } from "@/lib/manager/order-bag-weight";
import {
  draftToWire,
  type ClientPickerItem,
  type OrderDeliveryOption,
  type OrderEditInitial,
  type OrderItemDraft,
  type ProductSummary,
} from "./types";

export interface OrderFormProps {
  /** Режим форми: створення нового замовлення чи редагування наявного. */
  mode?: "create" | "edit";
  /** id замовлення (обов'язковий у режимі edit — використовується у PATCH). */
  orderId?: string;
  /** Початкові значення замовлення для режиму edit. */
  initialOrder?: OrderEditInitial | null;
  initialClientId?: string | null;
  initialClient?: ClientPickerItem | null;
  /** Початкові позиції для create (перенос із «Закриття замовлень», 7.3). */
  initialItems?: OrderItemDraft[];
  /** MgrClient.id для лінка «Відкрити картку клієнта» (edit-режим). */
  mgrClientId?: string | null;
  exchangeRate: number;
  deliveryMethods: OrderDeliveryOption[];
  currentUserId: string;
  currentUserName: string;
  /** Роль поточного користувача — визначає, чи доступний force-create. */
  currentUserRole?: string;
}

/** Ролі, що можуть форсувати створення другого активного замовлення (N1). */
const FORCE_ROLES = ["admin", "owner", "senior_manager"];

/**
 * Спосіб доставки клієнта → код доставки замовлення (7.3). Тепер обидва — з
 * одного довідника `MgrDeliveryMethod`, тож код клієнта прямо збігається з
 * опцією. Легасі-fallback для старих кодів (`nova_poshta`→`post`).
 */
function mapClientDeliveryToOrder(
  code: string | null | undefined,
  options: OrderDeliveryOption[],
): string {
  if (!code) return "";
  const direct = options.find((o) => o.code === code);
  if (direct) return direct.code;
  if (code === "nova_poshta" || code === "ukrposhta") {
    return options.find((o) => o.code === "post")?.code ?? "";
  }
  return "";
}

/** uid для нової позиції підбору. */
function newUid(): string {
  return `i-${Math.random().toString(36).slice(2, 10)}`;
}

export function OrderForm({
  mode = "create",
  orderId,
  initialOrder,
  initialClientId,
  initialClient,
  initialItems,
  mgrClientId,
  exchangeRate,
  deliveryMethods,
  currentUserName,
  currentUserRole,
}: OrderFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const canForce = FORCE_ROLES.includes(currentUserRole ?? "");

  /**
   * Поточний id збереженого документа. `null` доки чернетку ще не створено
   * (новий документ). Оновлюється або явним POST, або autosave (`onIdAssigned`).
   * Використовується у `submit`: якщо є id → PATCH, інакше POST — щоб явне
   * збереження не дублювало вже створену autosave-чернетку.
   */
  const [savedId, setSavedId] = useState<string | null>(orderId ?? null);

  const [clientId, setClientId] = useState<string | null>(
    initialClientId ?? null,
  );
  const [clientSummary, setClientSummary] = useState<ClientPickerItem | null>(
    initialClient ?? null,
  );
  const [items, setItems] = useState<OrderItemDraft[]>(
    initialOrder?.items ?? initialItems ?? [],
  );
  const [notes, setNotes] = useState(initialOrder?.notes ?? "");
  const [showComment, setShowComment] = useState(
    !!(initialOrder?.notes ?? "").trim(),
  );
  const [showContacts, setShowContacts] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Конфлікт «у клієнта вже є актуальне замовлення» (N2) ─────────────────
  const [activeConflict, setActiveConflict] = useState<{
    existingOrderId: string;
    existingOrderNumber: string;
  } | null>(null);

  // ─── Менеджерські поля (Етап 1) ───────────────────────────────────────────
  // Тип цін — дві фіксовані опції (продажна / акційна), відв'язані від
  // MgrPriceType. За замовчуванням «Ціна продажу» (wholesale); при додаванні
  // товару ціна підставляється авто (акційна якщо є — `autoUnitPrice`).
  const [sellingTypeCode, setSellingTypeCode] = useState<string>("wholesale");
  const [deliveryMethod, setDeliveryMethod] = useState<string>(
    initialOrder?.deliveryMethod ??
      mapClientDeliveryToOrder(
        initialClient?.deliveryMethodCode,
        deliveryMethods,
      ),
  );
  // Актуальність документа (1С «Статус заказа: Актуальне») — лише edit.
  const [isActual, setIsActual] = useState(initialOrder?.isActual ?? true);

  // ─── Автозбереження чернетки (наскрізне, План AUTOSAVE_REALTIME_PLAN) ──────
  // Дворівневий захист: рівень 1 (localStorage) + рівень 2 (жива чернетка в БД).
  // Заблоковані (проведені) документи не автозберігаються — лише перегляд.
  const autosaveEnabled = !isOrderLocked(initialOrder?.status ?? "draft");

  const draftData = useMemo(
    () => ({
      clientId,
      clientSummary,
      items,
      notes,
      deliveryMethod,
      sellingTypeCode,
    }),
    [clientId, clientSummary, items, notes, deliveryMethod, sellingTypeCode],
  );

  type OrderDraftData = typeof draftData;

  /** Тіло draft-запиту зі знімка форми (спільне для POST/PATCH чернетки). */
  const draftBody = useCallback(
    (d: OrderDraftData): Record<string, unknown> => {
      const wire = d.items
        .map(draftToWire)
        .filter((x): x is NonNullable<typeof x> => x !== null);
      return {
        draft: true,
        items: wire,
        notes: d.notes.trim() || null,
        exchangeRate: exchangeRate > 0 ? exchangeRate : undefined,
        priceTypeId: null,
        deliveryMethod: d.deliveryMethod || null,
      };
    },
    [exchangeRate],
  );

  const createDraftServer = useCallback(
    async (d: OrderDraftData): Promise<string> => {
      const res = await fetch("/api/v1/manager/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draftBody(d), customerId: d.clientId }),
      });
      if (!res.ok) throw new Error(`draft create ${res.status}`);
      const j = (await res.json()) as { id: string };
      return j.id;
    },
    [draftBody],
  );

  const updateDraftServer = useCallback(
    async (id: string, d: OrderDraftData): Promise<void> => {
      const res = await fetch(`/api/v1/manager/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftBody(d)),
      });
      if (!res.ok) throw new Error(`draft update ${res.status}`);
    },
    [draftBody],
  );

  const autosave = useDocumentAutosave<OrderDraftData>({
    docType: "order",
    existingId: orderId ?? null,
    data: draftData,
    enabled: autosaveEnabled,
    // Новий документ: серверна чернетка можлива лише коли обрано клієнта
    // (`Order.customerId` — обов'язковий FK) і немає невирішеного конфлікту
    // «одне активне на клієнта». До того захищає localStorage.
    canCreateDraft: clientId != null && activeConflict == null,
    createDraft: createDraftServer,
    updateDraft: updateDraftServer,
    onIdAssigned: (id) => {
      setSavedId(id);
      // Міняємо URL без remount форми (рефреш відкриє чернетку з БД).
      window.history.replaceState(null, "", `/manager/orders/${id}`);
    },
  });

  /** Застосувати відновлені з localStorage дані у стан форми. */
  function applyRestore(d: OrderDraftData): void {
    setClientId(d.clientId);
    setClientSummary(d.clientSummary);
    setItems(d.items);
    setNotes(d.notes);
    setShowComment(!!d.notes.trim());
    setDeliveryMethod(d.deliveryMethod);
    setSellingTypeCode(d.sellingTypeCode);
    autosave.acceptRestore();
  }

  /**
   * Перерахунок цін усіх рядків під обраний тип цін (override, як у 1С):
   *  - `wholesale` → форс продажної ціни кожного рядка (isAkciya=false);
   *  - `akciya`    → акційна-де-є (`autoUnitPrice`: акційна якщо є, інакше
   *                  продажна), з прапором isAkciya.
   */
  function recalcAllRows(nextSellingCode: string): void {
    setItems((prev) =>
      prev.map((row) => {
        if (!row.product) return row;
        let unit: number | null;
        let isAkciya: boolean;
        if (nextSellingCode === "akciya") {
          const auto = autoUnitPrice(row.product.prices);
          unit = auto.unit;
          isAkciya = auto.isAkciya;
        } else {
          unit = unitPriceForType(row.product.prices, "wholesale");
          isAkciya = false;
        }
        if (unit === null) return row; // немає прайсу — лишаємо ручний ввід
        const priceEur = Math.round(unit * row.weight * 100) / 100;
        return { ...row, unitPriceEur: unit, priceEur, isAkciya };
      }),
    );
  }

  function onPriceTypeChange(nextCode: string): void {
    setSellingTypeCode(nextCode);
    recalcAllRows(nextCode);
  }

  function onClientChange(
    id: string | null,
    summary: ClientPickerItem | null,
  ): void {
    setClientId(id);
    setClientSummary(summary);
    setActiveConflict(null);
    if (summary) {
      // Спосіб доставки за замовчуванням — з картки клієнта.
      const mappedDelivery = mapClientDeliveryToOrder(
        summary.deliveryMethodCode,
        deliveryMethods,
      );
      if (mappedDelivery) setDeliveryMethod(mappedDelivery);
      // Ранній діалог (7.3): одразу перевіряємо, чи у клієнта вже є активне
      // замовлення — щоб не робити зайву роботу з позиціями (лише create).
      if (!isEdit) void checkActiveOrder(id);
    }
  }

  /**
   * Перевіряє наявність активного замовлення у клієнта (за MgrClient.id) і,
   * якщо є, одразу показує діалог конфлікту — до заповнення позицій.
   */
  async function checkActiveOrder(mgrId: string | null): Promise<void> {
    if (!mgrId) return;
    try {
      const res = await fetch(
        `/api/v1/manager/orders/active-check?clientId=${encodeURIComponent(mgrId)}`,
      );
      if (!res.ok) return;
      const body = (await res.json()) as {
        existingOrderId?: string;
        existingOrderNumber?: string;
      };
      if (body.existingOrderId) {
        setActiveConflict({
          existingOrderId: body.existingOrderId,
          existingOrderNumber: body.existingOrderNumber ?? "",
        });
      }
    } catch {
      // best-effort — фінальний guard все одно спрацює при збереженні
    }
  }

  /**
   * Додає позицію з підбору (прайсу): товар + кількість мішків + ціна за кг
   * (із модалки — прайсова за типом цін або скоригована вручну кратно 0,05).
   * lotId завжди null. Вага = середня вага мішка × мішки; сума = ціна за кг ×
   * вага. Якщо товар уже є — додаємо мішки (зберігаючи передану ціну за кг).
   */
  function onAddFromPicker(
    product: ProductSummary,
    bags: number,
    unitPriceEur: number,
  ): void {
    const unit = Math.max(0, unitPriceEur);
    // Прапор «акційна» визначаємо за прайсом товара (акційна якщо є) —
    // незалежно від обраного типу цін (авто-підстановка при додаванні).
    const { isAkciya } = autoUnitPrice(product.prices);
    setItems((prev) => {
      const existing = prev.find((r) => r.product?.id === product.id);
      if (existing) {
        const quantity = existing.quantity + Math.max(1, Math.floor(bags) || 1);
        const weight = bagWeightForQuantity(
          { averageWeight: product.averageWeight },
          quantity,
        );
        const priceEur = Math.round(unit * weight * 100) / 100;
        return prev.map((r) =>
          r.uid === existing.uid
            ? { ...r, quantity, weight, priceEur, unitPriceEur: unit, isAkciya }
            : r,
        );
      }
      const quantity = Math.max(1, Math.floor(bags) || 1);
      const weight = bagWeightForQuantity(
        { averageWeight: product.averageWeight },
        quantity,
      );
      const priceEur = Math.round(unit * weight * 100) / 100;
      const draft: OrderItemDraft = {
        uid: newUid(),
        product,
        lot: null,
        bindToLot: false,
        quantity,
        weight,
        priceEur,
        unitPriceEur: unit,
        isAkciya,
      };
      return [...prev, draft];
    });
  }

  const wireItems = items
    .map(draftToWire)
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const itemsInvalid = wireItems.some(
    (i) => !i.productId || i.weight <= 0 || i.quantity <= 0,
  );
  // У create клієнт обов'язковий; у edit він фіксований (не міняємо).
  const canSubmit =
    (isEdit || !!clientId) &&
    wireItems.length > 0 &&
    !itemsInvalid &&
    !submitting;

  const clientDebt = clientSummary
    ? Number.parseFloat(clientSummary.debt)
    : null;

  // Номер документа: для edit — code1C замовлення або короткий id; для create — «авто».
  const orderNumber = isEdit ? (initialOrder?.displayNumber ?? "") : "авто";

  /**
   * Зберігає замовлення. Якщо є `savedId` (edit-режим АБО autosave вже створив
   * чернетку) — PATCH; інакше POST нового документа (щоб явне збереження не
   * дублювало вже створену autosave-чернетку).
   *
   * `post=true` → проводимо документ (статус `posted`). Після успіху — перехід
   * до списку замовлень.
   */
  async function submit(force = false, post = false): Promise<void> {
    const effectiveId = savedId;
    const usePatch = effectiveId != null;
    if (!usePatch && !clientId) return;
    setSubmitting(true);
    setError(null);
    try {
      // Перед явним записом — гасимо чергу autosave, щоб відкладений draft-PATCH
      // не перезаписав проведений/збережений документ після цього запиту.
      autosave.clearAll();
      const url = usePatch
        ? `/api/v1/manager/orders/${effectiveId}`
        : "/api/v1/manager/orders";
      const res = await fetch(url, {
        method: usePatch ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(usePatch ? {} : { customerId: clientId }),
          items: wireItems,
          notes: notes.trim() || (usePatch ? null : undefined),
          // Тип цін відв'язаний від MgrPriceType (wholesale/akciya — НЕ id) —
          // менеджерська ціна фіксується у рядках. На документ пишемо null.
          priceTypeId: null,
          deliveryMethod: deliveryMethod || null,
          ...(usePatch ? { isActual } : {}),
          ...(force && !usePatch ? { force: true } : {}),
          ...(post ? { post: true } : {}),
        }),
      });
      // 409 + active_order_exists — у клієнта вже є актуальне замовлення.
      if (res.status === 409 && !usePatch) {
        const body = (await res.json().catch(() => ({}))) as {
          code?: string;
          existingOrderId?: string;
          existingOrderNumber?: string;
        };
        if (body.code === "active_order_exists" && body.existingOrderId) {
          setActiveConflict({
            existingOrderId: body.existingOrderId,
            existingOrderNumber: body.existingOrderNumber ?? "",
          });
          return;
        }
      }
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(errBody.error ?? `Помилка ${res.status}`);
        return;
      }
      if (!usePatch) {
        const created = (await res.json().catch(() => ({}))) as { id?: string };
        if (created.id) setSavedId(created.id);
      }
      router.push("/manager/orders");
    } catch (e) {
      setError((e as Error).message ?? "Невідома помилка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {autosave.restoreData && (
        <RestoreDraftBanner
          onRestore={() => applyRestore(autosave.restoreData as OrderDraftData)}
          onDismiss={autosave.dismissRestore}
        />
      )}

      {/* ─── Секція: Контрагент ───────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Контрагент
        </h2>
        {isEdit ? (
          <div className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Клієнт</span>
            <div className="flex items-center justify-between rounded-lg border bg-gray-50 p-3">
              <div>
                <div className="font-medium text-gray-900">
                  {mgrClientId && clientSummary ? (
                    <button
                      type="button"
                      title="Відкрити картку клієнта (нова вкладка)"
                      onClick={() =>
                        openManagerTab(
                          `/manager/customers/${mgrClientId}`,
                          "Клієнт",
                        )
                      }
                      className="text-left hover:text-green-700 hover:underline"
                    >
                      {clientSummary.name}
                    </button>
                  ) : (
                    (clientSummary?.name ?? "—")
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {clientSummary?.city ?? ""}{" "}
                  {clientSummary?.code1C ? `· ${clientSummary.code1C}` : ""}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {mgrClientId && (
                  <button
                    type="button"
                    onClick={() =>
                      openManagerTab(
                        `/manager/customers/${mgrClientId}`,
                        "Клієнт",
                      )
                    }
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    Відкрити картку клієнта →
                  </button>
                )}
                <span className="text-xs text-gray-400">не змінюється</span>
              </div>
            </div>
          </div>
        ) : (
          <ClientPicker
            value={clientId}
            onChange={onClientChange}
            initialSummary={clientSummary}
          />
        )}

        {clientSummary && (
          <button
            type="button"
            onClick={() => setShowContacts((v) => !v)}
            className="mt-3 text-sm font-medium text-green-700 hover:text-green-800"
          >
            {showContacts ? "Сховати контактні дані" : "Контактні дані"}
          </button>
        )}
        {showContacts && clientSummary && (
          <dl className="mt-3 grid gap-1 rounded-lg border bg-gray-50 p-3 text-sm sm:grid-cols-3">
            <div className="flex gap-2">
              <dt className="text-gray-500">Телефон:</dt>
              <dd className="text-gray-800">{clientSummary.phone ?? "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500">Місто:</dt>
              <dd className="text-gray-800">{clientSummary.city ?? "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500">Адреса:</dt>
              <dd className="text-gray-800">{clientSummary.address ?? "—"}</dd>
            </div>
          </dl>
        )}

        {clientSummary && clientDebt !== null && clientDebt > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Борг клієнта:{" "}
            <span className="font-semibold">
              {clientDebt.toLocaleString("uk-UA", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              ₴
            </span>
          </div>
        )}
      </section>

      {/* ─── Секція: Параметри замовлення ─────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Параметри замовлення
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Тип цін */}
          <div>
            <label
              htmlFor="order-price-type"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Тип цін
            </label>
            <select
              id="order-price-type"
              value={sellingTypeCode}
              onChange={(e) => onPriceTypeChange(e.target.value)}
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              {SELLING_PRICE_TYPES.map((pt) => (
                <option key={pt.code} value={pt.code}>
                  {pt.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              При зміні ціни рядків перераховуються.
            </p>
          </div>

          {/* Доставка */}
          <div>
            <label
              htmlFor="order-delivery"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Доставка
            </label>
            <select
              id="order-delivery"
              value={deliveryMethod}
              onChange={(e) => setDeliveryMethod(e.target.value)}
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="">— Не вибрано —</option>
              {deliveryMethods.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* Номер + дата */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Номер
              </label>
              <input
                readOnly
                value={orderNumber}
                placeholder={isEdit ? "—" : "авто"}
                className="h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Дата
              </label>
              <input
                readOnly
                value={new Date().toLocaleDateString("uk-UA")}
                className="h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600"
              />
            </div>
          </div>
        </div>

        {/* Статус замовлення (актуальність) — лише у режимі редагування */}
        {isEdit && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
            <span className="text-sm font-medium text-gray-700">
              Статус замовлення:
            </span>
            <select
              value={isActual ? "actual" : "inactive"}
              onChange={(e) => setIsActual(e.target.value === "actual")}
              className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              aria-label="Статус замовлення (актуальність)"
            >
              <option value="actual">Актуальне</option>
              <option value="inactive">Неактуальне</option>
            </select>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                isActual
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {isActual ? "Актуальне" : "Неактуальне"}
            </span>
          </div>
        )}

        {/* Продавець */}
        <div className="mt-4 border-t pt-4">
          <p className="text-xs text-gray-400">
            Продаж зараховано вам ({currentUserName}).
          </p>
        </div>
      </section>

      {/* ─── Секція: Позиції ──────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Позиції
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowComment((v) => !v)}
            >
              <MessageSquare className="mr-1 h-4 w-4" />
              Коментар
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setPickerOpen(true)}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              <ListPlus className="mr-1 h-4 w-4" />
              Підбір товарів
            </Button>
          </div>
        </div>

        {showComment && (
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Коментар
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Будь-які примітки до замовлення (необов'язково)"
              rows={3}
              maxLength={2000}
            />
          </div>
        )}

        <ItemsEditor items={items} onChange={setItems} />

        <div className="mt-4">
          <OrderTotals items={items} exchangeRate={exchangeRate} />
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ─── Дії: зберегти (чернетка) / зберегти та провести ──────────────── */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {autosaveEnabled && (
          <AutosaveStatus
            status={autosave.status}
            savedAt={autosave.savedAt}
            className="mr-auto"
          />
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            router.push(
              savedId ? `/manager/orders/${savedId}` : "/manager/orders",
            )
          }
          disabled={submitting}
        >
          Скасувати
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!canSubmit}
          onClick={() => submit(false, false)}
        >
          {submitting ? "Збереження…" : "Зберегти"}
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() => submit(false, true)}
          className="bg-green-600 text-white hover:bg-green-700"
        >
          {submitting ? "Збереження…" : "Зберегти та провести"}
        </Button>
      </div>

      <ProductPricePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onAdd={onAddFromPicker}
      />

      {/* ─── Діалог: у клієнта вже є актуальне замовлення (N2) ──────────────── */}
      <Dialog
        open={!!activeConflict}
        onOpenChange={(open) => {
          if (!open) setActiveConflict(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              У клієнта вже є актуальне замовлення №
              {activeConflict?.existingOrderNumber || ""}
            </DialogTitle>
            <DialogDescription>
              Згідно правила, у клієнта має бути одне активне замовлення. Що
              зробити?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                const id = activeConflict?.existingOrderId;
                if (id) router.push(`/manager/orders/${id}`);
              }}
            >
              Відкрити існуюче
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => router.push("/manager/closures")}
            >
              Закрити старі
            </Button>
            {canForce && (
              <Button
                type="button"
                className="w-full bg-green-600 text-white hover:bg-green-700"
                disabled={submitting}
                onClick={() => {
                  setActiveConflict(null);
                  void submit(true, false);
                }}
              >
                Все одно створити
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
