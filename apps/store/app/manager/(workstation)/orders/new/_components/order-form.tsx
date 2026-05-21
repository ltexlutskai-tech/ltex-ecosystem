"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, ListPlus } from "lucide-react";
import { Button, Textarea } from "@ltex/ui";
import { ClientPicker } from "./client-picker";
import { ItemsEditor } from "./items-editor";
import { OrderTotals } from "./order-totals";
import { ProductPricePicker } from "./product-price-picker";
import { unitPriceForType } from "@/lib/manager/order-pricing";
import { bagWeightForQuantity } from "@/lib/manager/order-bag-weight";
import {
  getAllowedStatusTransitions,
  type ManagerOrderStatus,
} from "@/lib/manager/order-status";
import { OrderStatusBadge } from "../../../customers/[id]/_components/order-status-badge";
import {
  draftToWire,
  type AgentOption,
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
  agents: AgentOption[];
  deliveryMethods: OrderDeliveryOption[];
  currentUserId: string;
  currentUserName: string;
}

const STATUS_ACTION_LABEL: Record<ManagerOrderStatus, string> = {
  draft: "Повернути в чернетку",
  sent: "Відправити в 1С",
  posted: "Провести в 1С",
  cancelled: "Скасувати замовлення",
};

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
  agents,
  deliveryMethods,
  currentUserId,
  currentUserName,
}: OrderFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

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

  // У режимі редагування — поточний статус + бажаний статус для збереження.
  const [status, setStatus] = useState<string>(initialOrder?.status ?? "draft");

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
  const [cashOnDelivery, setCashOnDelivery] = useState(
    initialOrder?.cashOnDelivery ?? false,
  );
  const [assignToAgent, setAssignToAgent] = useState(
    isEdit
      ? !!initialOrder?.assignedAgentUserId &&
          initialOrder.assignedAgentUserId !== currentUserId
      : false,
  );
  const [assignedAgentUserId, setAssignedAgentUserId] = useState<string>(
    initialOrder?.assignedAgentUserId ?? currentUserId,
  );
  const [exportTo1C, setExportTo1C] = useState(
    initialOrder?.exportTo1C ?? true,
  );

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
   * Додає позицію з підбору (прайсу): товар + кількість мішків. lotId завжди
   * null. Вага = середня вага мішка × мішки; ціна за кг = за обраним типом
   * цін; сума = ціна за кг × вага. Якщо товар уже є — додаємо мішки.
   */
  function onAddFromPicker(product: ProductSummary, bags: number): void {
    const unit = unitPriceForType(product.prices, priceTypeCode) ?? 0;
    setItems((prev) => {
      const existing = prev.find((r) => r.product?.id === product.id);
      if (existing) {
        const quantity = existing.quantity + Math.max(1, Math.floor(bags) || 1);
        const weight = bagWeightForQuantity(
          { averageWeight: product.averageWeight },
          quantity,
        );
        const priceEur = Math.round(existing.unitPriceEur * weight * 100) / 100;
        return prev.map((r) =>
          r.uid === existing.uid ? { ...r, quantity, weight, priceEur } : r,
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

  const allowedTransitions = getAllowedStatusTransitions(status);

  // Номер документа: для edit — code1C замовлення або короткий id; для create — «авто».
  const orderNumber = isEdit ? (initialOrder?.displayNumber ?? "") : "авто";

  /**
   * Зберігає замовлення (POST у create, PATCH у edit). Опційний `nextStatus`
   * (тільки edit) — змінює статус разом зі збереженням шапки/товарів.
   */
  async function submit(nextStatus?: ManagerOrderStatus): Promise<void> {
    if (!isEdit && !clientId) return;
    if (isEdit && !orderId) return;
    setSubmitting(true);
    setError(null);
    try {
      const payloadAgent = assignToAgent ? assignedAgentUserId : currentUserId;
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
          cashOnDelivery,
          assignedAgentUserId: payloadAgent,
          exportTo1C,
          ...(isEdit && nextStatus ? { status: nextStatus } : {}),
        }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(errBody.error ?? `Помилка ${res.status}`);
        return;
      }
      if (isEdit) {
        if (nextStatus) setStatus(nextStatus);
        router.refresh();
        return;
      }
      const order = (await res.json()) as { id: string };
      router.push(`/manager/orders/${order.id}`);
    } catch (e) {
      setError((e as Error).message ?? "Невідома помилка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* ─── Шапка документа (як у 1С) ──────────────────────────────────────
          Зверху-праворуч: чекбокси «призначити продаж торговому» +
          «вивантажувати в 1С», під ними — № документа і дата. */}
      <div className="rounded-lg border bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          {/* Ліва колонка шапки порожня тут — клієнт нижче. */}
          <div className="order-2 lg:order-1" />

          {/* Права колонка: чекбокси + № + дата + маршрут */}
          <div className="order-1 w-full space-y-3 lg:order-2 lg:max-w-sm">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={assignToAgent}
                  onChange={(e) => {
                    setAssignToAgent(e.target.checked);
                    if (!e.target.checked)
                      setAssignedAgentUserId(currentUserId);
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Призначити продаж торговому</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={exportTo1C}
                  onChange={(e) => setExportTo1C(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Вивантажувати в 1С</span>
              </label>
            </div>

            {assignToAgent && (
              <select
                aria-label="Торговий агент"
                value={assignedAgentUserId}
                onChange={(e) => setAssignedAgentUserId(e.target.value)}
                className="h-9 w-full rounded border border-gray-300 bg-white px-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fullName}
                    {a.id === currentUserId ? " (я)" : ""}
                  </option>
                ))}
              </select>
            )}
            {!assignToAgent && (
              <p className="text-xs text-gray-400">
                Продаж зараховано вам ({currentUserName}).
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  Номер
                </label>
                <input
                  readOnly
                  value={orderNumber}
                  placeholder={isEdit ? "—" : "авто"}
                  className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2 text-sm text-gray-600"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Дата</label>
                <input
                  readOnly
                  value={new Date().toLocaleDateString("uk-UA")}
                  className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2 text-sm text-gray-600"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-500">
                Маршрутний лист
              </label>
              <input
                disabled
                placeholder="Блок «Маршрути» — у розробці"
                className="h-9 w-full cursor-not-allowed rounded border border-gray-200 bg-gray-50 px-2 text-sm text-gray-400"
              />
            </div>
          </div>
        </div>

        {/* ─── Контрагент (ліворуч) + Тип цін (праворуч) ───────────────────── */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            {isEdit ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Контрагент
                </label>
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
                className="mt-2 text-sm text-blue-600 hover:text-blue-800"
              >
                {showContacts ? "Сховати контактні дані" : "Контактні дані"}
              </button>
            )}
            {showContacts && clientSummary && (
              <dl className="mt-2 space-y-1 rounded-lg border bg-gray-50 p-3 text-sm">
                <div className="flex gap-2">
                  <dt className="text-gray-500">Телефон:</dt>
                  <dd className="text-gray-800">
                    {clientSummary.phone ?? "—"}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-500">Місто:</dt>
                  <dd className="text-gray-800">{clientSummary.city ?? "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-500">Адреса:</dt>
                  <dd className="text-gray-800">
                    {clientSummary.address ?? "—"}
                  </dd>
                </div>
              </dl>
            )}
          </div>

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
              className="h-9 w-full rounded border border-gray-300 bg-white px-2 text-sm focus:border-blue-500 focus:outline-none"
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
        </div>

        {/* ─── Доставка (по центру) + Наложка (праворуч) ──────────────────── */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-center sm:gap-6">
          <div className="sm:w-64">
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
              className="h-9 w-full rounded border border-gray-300 bg-white px-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">— Не вибрано —</option>
              {deliveryMethods.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={cashOnDelivery}
              onChange={(e) => setCashOnDelivery(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Наложка (післяплата)</span>
          </label>
        </div>
      </div>

      {/* ─── Статус (тільки edit) ─────────────────────────────────────────── */}
      {isEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Статус:</span>
            <OrderStatusBadge status={status} />
          </div>
          {allowedTransitions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allowedTransitions.map((next) => (
                <Button
                  key={next}
                  type="button"
                  size="sm"
                  variant={next === "cancelled" ? "outline" : "default"}
                  disabled={submitting}
                  onClick={() => submit(next)}
                  className={
                    next === "cancelled"
                      ? "border-red-300 text-red-600 hover:bg-red-50"
                      : ""
                  }
                >
                  {STATUS_ACTION_LABEL[next]}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {clientSummary && clientDebt !== null && clientDebt > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
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

      {/* ─── Кнопки: Коментар · Підбір (ліворуч) · Зберегти (праворуч) ────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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
            variant="outline"
            size="sm"
            onClick={() => setPickerOpen(true)}
          >
            <ListPlus className="mr-1 h-4 w-4" />
            Підбір
          </Button>
        </div>
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
              : "Зберегти"}
        </Button>
      </div>

      {showComment && (
        <div>
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

      {/* ─── Таблиця товарів (1С-стиль) ───────────────────────────────────── */}
      <ItemsEditor items={items} onChange={setItems} />

      {/* ─── Підсумки ─────────────────────────────────────────────────────── */}
      <OrderTotals items={items} exchangeRate={exchangeRate} />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

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
              ? "Зберегти зміни"
              : "Створити замовлення"}
        </Button>
      </div>

      <ProductPricePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        priceTypeCode={priceTypeCode}
        onAdd={onAddFromPicker}
      />
    </div>
  );
}
