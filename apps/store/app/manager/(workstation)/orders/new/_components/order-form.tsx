"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, ListPlus } from "lucide-react";
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
import { unitPriceForType } from "@/lib/manager/order-pricing";
import { bagWeightForQuantity } from "@/lib/manager/order-bag-weight";
import {
  draftToWire,
  type ClientPickerItem,
  type OrderDeliveryOption,
  type OrderEditInitial,
  type OrderItemDraft,
  type PriceTypeOption,
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
  exchangeRate: number;
  priceTypes: PriceTypeOption[];
  deliveryMethods: OrderDeliveryOption[];
  currentUserId: string;
  currentUserName: string;
  /** Роль поточного користувача — визначає, чи доступний force-create. */
  currentUserRole?: string;
}

/** Ролі, що можуть форсувати створення другого активного замовлення (N1). */
const FORCE_ROLES = ["admin", "owner", "senior_manager"];

/**
 * Зіставляє код способу доставки клієнта (MgrDeliveryMethod.code, напр.
 * `nova_poshta`/`delivery`/`pickup`) з кодом доставки замовлення
 * (delivery|post|pickup). Те, що не мапиться — лишаємо порожнім.
 */
function mapClientDeliveryToOrder(
  code: string | null | undefined,
  options: OrderDeliveryOption[],
): string {
  if (!code) return "";
  const direct = options.find((o) => o.code === code);
  if (direct) return direct.code;
  if (code === "nova_poshta" || code === "post" || code === "ukrposhta") {
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
  exchangeRate,
  priceTypes,
  deliveryMethods,
  currentUserName,
  currentUserRole,
}: OrderFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const canForce = FORCE_ROLES.includes(currentUserRole ?? "");

  const [clientId, setClientId] = useState<string | null>(
    initialClientId ?? null,
  );
  const [clientSummary, setClientSummary] = useState<ClientPickerItem | null>(
    initialClient ?? null,
  );
  const [items, setItems] = useState<OrderItemDraft[]>(
    initialOrder?.items ?? [],
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
  const [priceTypeId, setPriceTypeId] = useState<string>(
    initialOrder?.priceTypeId ??
      initialClient?.priceTypeId ??
      priceTypes[0]?.id ??
      "",
  );
  const [deliveryMethod, setDeliveryMethod] = useState<string>(
    initialOrder?.deliveryMethod ??
      mapClientDeliveryToOrder(
        initialClient?.deliveryMethodCode,
        deliveryMethods,
      ),
  );
  const [exportTo1C, setExportTo1C] = useState(
    initialOrder?.exportTo1C ?? true,
  );
  // Актуальність документа (1С «Статус заказа: Актуальне») — лише edit.
  const [isActual, setIsActual] = useState(initialOrder?.isActual ?? true);

  const priceTypeCode =
    priceTypes.find((p) => p.id === priceTypeId)?.code ?? null;

  /** Перерахунок цін усіх рядків під обраний тип цін (як у 1С). */
  function recalcAllRows(nextPriceTypeCode: string | null): void {
    setItems((prev) =>
      prev.map((row) => {
        if (!row.product) return row;
        const unit = unitPriceForType(row.product.prices, nextPriceTypeCode);
        if (unit === null) return row; // немає прайсу — лишаємо ручний ввід
        const priceEur = Math.round(unit * row.weight * 100) / 100;
        return { ...row, unitPriceEur: unit, priceEur };
      }),
    );
  }

  function onPriceTypeChange(nextId: string): void {
    setPriceTypeId(nextId);
    const code = priceTypes.find((p) => p.id === nextId)?.code ?? null;
    recalcAllRows(code);
  }

  function onClientChange(
    id: string | null,
    summary: ClientPickerItem | null,
  ): void {
    setClientId(id);
    setClientSummary(summary);
    if (summary) {
      // Підтягуємо тип цін клієнта (+ перерахунок), способ доставки.
      if (summary.priceTypeId) {
        const exists = priceTypes.some((p) => p.id === summary.priceTypeId);
        if (exists) {
          setPriceTypeId(summary.priceTypeId);
          const code =
            priceTypes.find((p) => p.id === summary.priceTypeId)?.code ?? null;
          recalcAllRows(code);
        }
      }
      const mappedDelivery = mapClientDeliveryToOrder(
        summary.deliveryMethodCode,
        deliveryMethods,
      );
      if (mappedDelivery) setDeliveryMethod(mappedDelivery);
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
            ? { ...r, quantity, weight, priceEur, unitPriceEur: unit }
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
   * Зберігає замовлення (POST у create, PATCH у edit). Статус документа з UI
   * не змінюється (керується 1С). Після успіху — перехід до списку замовлень.
   */
  async function submit(force = false): Promise<void> {
    if (!isEdit && !clientId) return;
    if (isEdit && !orderId) return;
    setSubmitting(true);
    setError(null);
    try {
      const url = isEdit
        ? `/api/v1/manager/orders/${orderId}`
        : "/api/v1/manager/orders";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isEdit ? {} : { customerId: clientId }),
          items: wireItems,
          notes: notes.trim() || (isEdit ? null : undefined),
          priceTypeId: priceTypeId || null,
          deliveryMethod: deliveryMethod || null,
          exportTo1C,
          ...(isEdit ? { isActual } : {}),
          ...(force ? { force: true } : {}),
        }),
      });
      // 409 + active_order_exists — у клієнта вже є актуальне замовлення.
      if (res.status === 409 && !isEdit) {
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
      router.push("/manager/orders");
    } catch (e) {
      setError((e as Error).message ?? "Невідома помилка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* ─── Секція: Контрагент ───────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Контрагент
        </h2>
        {isEdit ? (
          <div className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Клієнт</span>
            <div className="flex items-center justify-between rounded-lg border bg-gray-50 p-3">
              <div>
                <div className="font-medium text-gray-900">
                  {clientSummary?.name ?? "—"}
                </div>
                <div className="text-xs text-gray-500">
                  {clientSummary?.city ?? ""}{" "}
                  {clientSummary?.code1C ? `· ${clientSummary.code1C}` : ""}
                </div>
              </div>
              <span className="text-xs text-gray-400">не змінюється</span>
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
      <section className="rounded-lg border bg-white p-5 shadow-sm">
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
              value={priceTypeId}
              onChange={(e) => onPriceTypeChange(e.target.value)}
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              {priceTypes.length === 0 && (
                <option value="">— Немає типів цін —</option>
              )}
              {priceTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
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

        {/* Чекбокс: експорт у 1С */}
        <div className="mt-4 flex flex-col gap-3 border-t pt-4">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={exportTo1C}
              onChange={(e) => setExportTo1C(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <span>Вивантажувати в 1С</span>
          </label>
          <p className="text-xs text-gray-400">
            Продаж зараховано вам ({currentUserName}).
          </p>
        </div>
      </section>

      {/* ─── Секція: Позиції ──────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-5 shadow-sm">
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

      {/* ─── Дії: одна кнопка збереження ──────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            router.push(
              isEdit && orderId
                ? `/manager/orders/${orderId}`
                : "/manager/orders",
            )
          }
          disabled={submitting}
        >
          Скасувати
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() => submit()}
          className="bg-green-600 text-white hover:bg-green-700"
        >
          {submitting
            ? isEdit
              ? "Збереження…"
              : "Створення…"
            : isEdit
              ? "Зберегти"
              : "Створити замовлення"}
        </Button>
      </div>

      <ProductPricePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        priceTypeCode={priceTypeCode}
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
                  void submit(true);
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
