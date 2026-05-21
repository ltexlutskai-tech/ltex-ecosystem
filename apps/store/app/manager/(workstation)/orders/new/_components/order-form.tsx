"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea } from "@ltex/ui";
import { ClientPicker } from "./client-picker";
import { ItemsEditor, emptyDraft } from "./items-editor";
import { OrderTotals } from "./order-totals";
import { recalcLinePrice } from "@/lib/manager/order-pricing";
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
    initialOrder?.items?.length ? initialOrder.items : [emptyDraft()],
  );
  const [notes, setNotes] = useState(initialOrder?.notes ?? "");
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
        // Конкретний лот має власну фіксовану ціну — не чіпаємо.
        if (row.bindToLot && row.lot) return row;
        return {
          ...row,
          priceEur: recalcLinePrice(
            row.product.prices,
            nextPriceTypeCode,
            row.weight,
            row.priceEur,
          ),
        };
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
    <div className="space-y-6">
      {isEdit ? (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Клієнт</label>
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
            <span className="text-xs text-gray-400">Клієнт не змінюється</span>
          </div>
        </div>
      ) : (
        <ClientPicker
          value={clientId}
          onChange={onClientChange}
          initialSummary={clientSummary}
        />
      )}

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

      {/* ─── Параметри замовлення ─────────────────────────────────────────── */}
      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold text-gray-800">
          Параметри замовлення
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
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
              При зміні ціни рядків перераховуються (крім конкретних лотів).
            </p>
          </div>

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
        </div>

        <div className="mt-4 space-y-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cashOnDelivery}
              onChange={(e) => setCashOnDelivery(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Наложка (післяплата)</span>
          </label>

          <div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={assignToAgent}
                onChange={(e) => {
                  setAssignToAgent(e.target.checked);
                  if (!e.target.checked) setAssignedAgentUserId(currentUserId);
                }}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Призначити продаж торговому контрагенту</span>
            </label>
            {assignToAgent && (
              <select
                value={assignedAgentUserId}
                onChange={(e) => setAssignedAgentUserId(e.target.value)}
                className="mt-2 h-9 w-full rounded border border-gray-300 bg-white px-2 text-sm focus:border-blue-500 focus:outline-none sm:w-72"
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
              <p className="mt-1 text-xs text-gray-400">
                Продаж зараховано вам ({currentUserName}).
              </p>
            )}
          </div>

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
      </div>

      <ItemsEditor
        items={items}
        onChange={setItems}
        priceTypeCode={priceTypeCode}
      />

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
    </div>
  );
}
