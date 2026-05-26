"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  ListPlus,
  Send,
  Users,
  Wallet,
  Search,
} from "lucide-react";
import { Button, Textarea } from "@ltex/ui";
import { ClientPicker } from "../../../orders/new/_components/client-picker";
import { ShareSheet } from "../../../prices/_components/share-sheet";
import { SaleItemsEditor } from "./sale-items-editor";
import { SaleTotals } from "./sale-totals";
import { BarcodeInput } from "./barcode-input";
import {
  SaleLotPicker,
  type SaleGeneralPick,
  type SaleLotPick,
} from "./sale-lot-picker";
import { unitPriceForType } from "@/lib/manager/order-pricing";
import { bagWeightForQuantity } from "@/lib/manager/order-bag-weight";
import {
  buildClientSaleMessage,
  buildGroupSaleMessage,
  type SaleMessageInput,
  type SaleMessageItem,
} from "@/lib/manager/sale-message";
import { type ManagerSaleStatus } from "@/lib/manager/sale-status";
import {
  draftToWire,
  lineTotalEur,
  type ClientPickerItem,
  type OrderDeliveryOption,
  type PriceTypeOption,
  type ProductSummary,
  type SaleEditInitial,
  type SaleItemDraft,
} from "./sale-types";

export interface SaleFormProps {
  mode?: "create" | "edit";
  /** id реалізації (обов'язковий у режимі edit — використовується у PATCH). */
  saleId?: string;
  initialSale?: SaleEditInitial | null;
  initialClientId?: string | null;
  initialClient?: ClientPickerItem | null;
  /** Знімок курсу EUR→UAH. */
  exchangeRateEur: number;
  /** Знімок курсу USD→UAH (для документа). */
  exchangeRateUsd: number;
  priceTypes: PriceTypeOption[];
  deliveryMethods: OrderDeliveryOption[];
  currentUserId: string;
  currentUserName: string;
  /**
   * МЛ-контекст: коли реалізацію створюють зсередини Маршрутного листа.
   * Передається у POST як `routeSheetId`; після успіху користувач
   * повертається на `returnHref` (сторінку МЛ), а не у список реалізацій.
   */
  routeSheetId?: string | null;
  /** Куди повертатись після створення (за замовч. список реалізацій). */
  returnHref?: string | null;
}

/** Зіставляє код способу доставки клієнта з кодом доставки документа. */
function mapClientDelivery(
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

function newUid(): string {
  return `i-${Math.random().toString(36).slice(2, 10)}`;
}

interface BarcodeLookupResponse {
  lot: {
    id: string;
    barcode: string;
    weight: number;
    quantity: number;
    status: string;
    reservedByUserId: string | null;
    reservedByName: string | null;
    reservedUntil: string | null;
  };
  product: {
    id: string;
    code1C: string | null;
    articleCode: string | null;
    name: string;
    slug: string;
    priceUnit: string;
    averageWeight: number | null;
  };
  prices: Array<{ priceType: string; amount: number; currency: string }>;
}

export function SaleForm({
  mode = "create",
  saleId,
  initialSale,
  initialClientId,
  initialClient,
  exchangeRateEur,
  exchangeRateUsd,
  priceTypes,
  deliveryMethods,
  currentUserId,
  currentUserName,
  routeSheetId,
  returnHref,
}: SaleFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";
  /** Куди повертатись після звичайного збереження (МЛ або список). */
  const successHref = returnHref ?? "/manager/sales";

  const [clientId, setClientId] = useState<string | null>(
    initialClientId ?? null,
  );
  const [clientSummary, setClientSummary] = useState<ClientPickerItem | null>(
    initialClient ?? null,
  );
  const [items, setItems] = useState<SaleItemDraft[]>(initialSale?.items ?? []);
  const [notes, setNotes] = useState(initialSale?.notes ?? "");
  const [showComment, setShowComment] = useState(
    !!(initialSale?.notes ?? "").trim(),
  );
  const [showContacts, setShowContacts] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  // ─── Повідомлення (Viber/share) ─────────────────────────────────────────
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTitle, setShareTitle] = useState("");
  const [shareText, setShareText] = useState("");

  // ─── Менеджерські поля ──────────────────────────────────────────────────
  const [priceTypeId, setPriceTypeId] = useState<string>(
    initialSale?.priceTypeId ??
      initialClient?.priceTypeId ??
      priceTypes[0]?.id ??
      "",
  );
  const [deliveryMethod, setDeliveryMethod] = useState<string>(
    initialSale?.deliveryMethod ??
      mapClientDelivery(initialClient?.deliveryMethodCode, deliveryMethods),
  );
  const [novaPoshtaBranch, setNovaPoshtaBranch] = useState(
    initialSale?.novaPoshtaBranch ?? "",
  );
  const [cashOnDelivery, setCashOnDelivery] = useState(
    initialSale?.cashOnDelivery ?? false,
  );
  const [onTradeAgent, setOnTradeAgent] = useState(
    initialSale?.onTradeAgent ?? true,
  );
  const [exportTo1C, setExportTo1C] = useState(initialSale?.exportTo1C ?? true);
  const [expressWaybill, setExpressWaybill] = useState(
    initialSale?.expressWaybill ?? "",
  );

  const priceTypeCode =
    priceTypes.find((p) => p.id === priceTypeId)?.code ?? null;

  /** Перерахунок цін за кг усіх рядків під обраний тип цін (як у 1С). */
  function recalcAllRows(nextPriceTypeCode: string | null): void {
    setItems((prev) =>
      prev.map((row) => {
        if (!row.product) return row;
        const unit = unitPriceForType(row.product.prices, nextPriceTypeCode);
        if (unit === null) return row; // немає прайсу — лишаємо ручний ввід
        return {
          ...row,
          pricePerKg: unit,
          priceEur: lineTotalEur(unit, row.weight, row.quantity),
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
      if (summary.priceTypeId) {
        const exists = priceTypes.some((p) => p.id === summary.priceTypeId);
        if (exists) {
          setPriceTypeId(summary.priceTypeId);
          const code =
            priceTypes.find((p) => p.id === summary.priceTypeId)?.code ?? null;
          recalcAllRows(code);
        }
      }
      const mapped = mapClientDelivery(
        summary.deliveryMethodCode,
        deliveryMethods,
      );
      if (mapped) setDeliveryMethod(mapped);
    }
  }

  /**
   * Підбір — конкретний лот (мішок). Рядок несе lotId/barcode/weight лота та
   * прайсову ціну за кг (за типом цін). Дубль за лотом ігнорується.
   */
  function onAddLotFromPicker(pick: SaleLotPick): void {
    setItems((prev) => {
      if (prev.some((r) => r.lotId === pick.lotId)) return prev; // дубль лота
      const unit = Math.max(0, pick.pricePerKg);
      const weight = pick.weight > 0 ? pick.weight : 0;
      const draft: SaleItemDraft = {
        uid: newUid(),
        product: pick.product,
        lotId: pick.lotId,
        barcode: pick.barcode,
        quantity: 1,
        weight,
        pricePerKg: unit,
        priceEur: lineTotalEur(unit, weight, 1),
      };
      return [...prev, draft];
    });
  }

  /**
   * Підбір — загальна позиція (lotId=null) для товарів без вільних лотів.
   * Вага = середня вага мішка × мішки; ціна за кг — прайсова за типом цін.
   */
  function onAddGeneralFromPicker(pick: SaleGeneralPick): void {
    const { product, bags, pricePerKg } = pick;
    const unit = Math.max(0, pricePerKg);
    setItems((prev) => {
      // Дубль за товаром (загальна позиція без лота) — додаємо мішки.
      const existing = prev.find(
        (r) => r.product?.id === product.id && r.lotId === null,
      );
      if (existing) {
        const quantity = existing.quantity + Math.max(1, Math.floor(bags) || 1);
        const weight = bagWeightForQuantity(
          { averageWeight: product.averageWeight },
          quantity,
        );
        return prev.map((r) =>
          r.uid === existing.uid
            ? {
                ...r,
                quantity,
                weight,
                pricePerKg: unit,
                priceEur: lineTotalEur(unit, weight, 1),
              }
            : r,
        );
      }
      const quantity = Math.max(1, Math.floor(bags) || 1);
      const weight = bagWeightForQuantity(
        { averageWeight: product.averageWeight },
        quantity,
      );
      const draft: SaleItemDraft = {
        uid: newUid(),
        product,
        lotId: null,
        barcode: null,
        quantity,
        weight,
        pricePerKg: unit,
        priceEur: lineTotalEur(unit, weight, 1),
      };
      return [...prev, draft];
    });
  }

  /** Резолв ШК → конкретний лот → новий рядок зі збереженим lotId/barcode. */
  async function onBarcode(code: string): Promise<void> {
    setBarcodeError(null);
    try {
      const url = new URL(
        "/api/v1/manager/lots/by-barcode",
        window.location.origin,
      );
      url.searchParams.set("code", code);
      if (priceTypeId) url.searchParams.set("priceTypeId", priceTypeId);
      const res = await fetch(url.toString());
      if (res.status === 404) {
        setBarcodeError("Не знайдено товар за ШК");
        return;
      }
      if (!res.ok) {
        setBarcodeError(`Помилка ${res.status}`);
        return;
      }
      const data = (await res.json()) as BarcodeLookupResponse;

      // Дубль за лотом — товар уже додано.
      const dup = items.find((r) => r.lotId === data.lot.id);
      if (dup) {
        setBarcodeError("Товар уже додано");
        return;
      }

      const product: ProductSummary = {
        id: data.product.id,
        code1C: data.product.code1C,
        articleCode: data.product.articleCode,
        name: data.product.name,
        slug: data.product.slug,
        priceUnit: data.product.priceUnit,
        averageWeight: data.product.averageWeight,
        inStock: true,
        prices: data.prices,
      };
      const unit = unitPriceForType(data.prices, priceTypeCode) ?? 0;
      const weight = data.lot.weight > 0 ? data.lot.weight : 0;

      const draft: SaleItemDraft = {
        uid: newUid(),
        product,
        lotId: data.lot.id,
        barcode: data.lot.barcode,
        quantity: 1,
        weight,
        pricePerKg: unit,
        priceEur: lineTotalEur(unit, weight, 1),
      };
      setItems((prev) => [...prev, draft]);
    } catch (e) {
      setBarcodeError((e as Error).message ?? "Помилка резолву ШК");
    }
  }

  const wireItems = items
    .map(draftToWire)
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const itemsInvalid = wireItems.some(
    (i) => !i.productId || i.weight <= 0 || i.quantity <= 0,
  );
  const canSubmit =
    (isEdit || !!clientId) &&
    wireItems.length > 0 &&
    !itemsInvalid &&
    !submitting;

  const clientDebt = clientSummary
    ? Number.parseFloat(clientSummary.debt)
    : null;

  const docNumber = isEdit ? (initialSale?.displayNumber ?? "") : "авто";

  /**
   * Зберігає документ (POST/PATCH). Повертає id збереженої реалізації або
   * `null` на помилці. `nextStatus` — лише для статусних переходів у edit.
   *
   * Куди йти після збереження визначає `submit()` / кнопки оплат:
   *  - звичайне збереження → список `/manager/sales` (Fix 6);
   *  - «Оплата» / «Історія оплат» → деталь з відповідним query/hash.
   */
  async function saveSale(
    nextStatus?: ManagerSaleStatus,
  ): Promise<string | null> {
    if (!isEdit && !clientId) return null;
    if (isEdit && !saleId) return null;
    setSubmitting(true);
    setError(null);
    try {
      // Fix 3: «На торгового контрагента» → продаж зараховується агенту клієнта
      // (1С сам визначає кого) → assignedAgentUserId=null; інакше — поточний
      // продавець.
      const payloadAgent = onTradeAgent ? null : currentUserId;
      const url = isEdit
        ? `/api/v1/manager/sales/${saleId}`
        : "/api/v1/manager/sales";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isEdit ? {} : { customerId: clientId }),
          items: wireItems,
          notes: notes.trim() || (isEdit ? null : undefined),
          exchangeRateEur: exchangeRateEur > 0 ? exchangeRateEur : undefined,
          exchangeRateUsd: exchangeRateUsd > 0 ? exchangeRateUsd : undefined,
          priceTypeId: priceTypeId || null,
          deliveryMethod: deliveryMethod || null,
          novaPoshtaBranch: novaPoshtaBranch.trim() || null,
          cashOnDelivery,
          assignedAgentUserId: payloadAgent,
          onTradeAgent,
          exportTo1C,
          expressWaybill: expressWaybill.trim() || null,
          ...(isEdit ? {} : { routeSheetId: routeSheetId ?? undefined }),
          ...(isEdit && nextStatus ? { status: nextStatus } : {}),
        }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(errBody.error ?? `Помилка ${res.status}`);
        return null;
      }
      if (isEdit) {
        return saleId ?? null;
      }
      const sale = (await res.json()) as { id: string };
      return sale.id;
    } catch (e) {
      setError((e as Error).message ?? "Невідома помилка");
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  /** Основне збереження — після успіху → список реалізацій (Fix 6). */
  async function submit(nextStatus?: ManagerSaleStatus): Promise<void> {
    const id = await saveSale(nextStatus);
    if (id === null) return;
    // Статусний перехід у edit лишає менеджера на сторінці (бачить новий стан).
    if (isEdit && nextStatus) {
      router.refresh();
      return;
    }
    // МЛ-контекст → назад на сторінку Маршрутного листа; інакше — список.
    router.push(successHref);
  }

  /** Зберегти й перейти до оплат на детальній сторінці (Fix 6). */
  async function saveAndGoToPayments(mode: "pay" | "history"): Promise<void> {
    const id = await saveSale();
    if (id === null) return;
    router.push(
      mode === "pay"
        ? `/manager/sales/${id}?pay=1`
        : `/manager/sales/${id}#payments`,
    );
  }

  // Сума післяплати (грн) — округлення повної суми (оплати у Етапі 4 → paid=0).
  const totalEur = items
    .filter((i) => i.product)
    .reduce((s, i) => s + (i.priceEur || 0), 0);
  const codAmountUah = Math.round(totalEur * exchangeRateEur);

  // Чи можна відправити повідомлення (мають бути позиції).
  const hasItems = items.some((i) => i.product);

  /** Зведений вхід для білдерів повідомлень з поточного стану форми. */
  function buildMessageInput(): SaleMessageInput {
    const messageItems: SaleMessageItem[] = items
      .filter((i) => i.product)
      .map((i) => ({
        productName: i.product?.name ?? "",
        articleCode: i.product?.articleCode ?? null,
        barcode: i.barcode,
        quantity: i.quantity,
        weight: i.weight,
        pricePerKg: i.pricePerKg,
        priceEur: i.priceEur,
      }));
    return {
      clientName: clientSummary?.name ?? "",
      // ClientPickerItem не несе region — лишається опційним (необов'язкове поле).
      region: null,
      city: clientSummary?.city ?? null,
      phone: clientSummary?.phone ?? null,
      deliveryMethod: deliveryMethod || null,
      novaPoshtaBranch: novaPoshtaBranch.trim() || null,
      items: messageItems,
      totalEur,
      exchangeRateEur,
      cashOnDelivery,
      codAmountUah: cashOnDelivery ? codAmountUah : null,
      notes: notes.trim() || null,
      date: new Date(),
    };
  }

  function openClientMessage(): void {
    setShareTitle("Повідомлення контрагенту");
    setShareText(buildClientSaleMessage(buildMessageInput()));
    setShareOpen(true);
  }

  function openGroupMessage(): void {
    setShareTitle("Повідомлення у групу");
    setShareText(buildGroupSaleMessage(buildMessageInput()));
    setShareOpen(true);
  }

  return (
    <div className="space-y-5">
      {/* ─── Секція: Контрагент ──────────────────────────────────────────── */}
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
            {cashOnDelivery ? "Наложка" : "Борг клієнта"}:{" "}
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

      {/* ─── Секція: Параметри реалізації ────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Параметри реалізації
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Тип цін */}
          <div>
            <label
              htmlFor="sale-price-type"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Тип цін
            </label>
            <select
              id="sale-price-type"
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
              htmlFor="sale-delivery"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Доставка
            </label>
            <select
              id="sale-delivery"
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

          {/* № відділення НП */}
          <div>
            <label
              htmlFor="sale-np-branch"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              № відділення НП
            </label>
            <input
              id="sale-np-branch"
              value={novaPoshtaBranch}
              onChange={(e) => setNovaPoshtaBranch(e.target.value)}
              maxLength={20}
              placeholder="напр. 12"
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          {/* Номер + дата */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Номер
            </label>
            <input
              readOnly
              value={docNumber}
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

          {/* ТТН */}
          <div>
            <label
              htmlFor="sale-ttn"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              ТТН (експрес-накладна)
            </label>
            <input
              id="sale-ttn"
              value={expressWaybill}
              onChange={(e) => setExpressWaybill(e.target.value)}
              maxLength={60}
              placeholder="номер накладної"
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
        </div>

        {/* Курс EUR/USD (read-only знімок) */}
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-1 border-t pt-4 text-xs text-gray-500">
          <span>
            Курс EUR→UAH:{" "}
            <span className="font-medium text-gray-700">
              {exchangeRateEur > 0 ? exchangeRateEur.toFixed(2) : "—"}
            </span>
          </span>
          <span>
            Курс USD→UAH:{" "}
            <span className="font-medium text-gray-700">
              {exchangeRateUsd > 0 ? exchangeRateUsd.toFixed(2) : "—"}
            </span>
          </span>
        </div>

        {/* Чекбокси */}
        <div className="mt-4 flex flex-col gap-3 border-t pt-4">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={cashOnDelivery}
                onChange={(e) => setCashOnDelivery(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>Наложка (післяплата)</span>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={onTradeAgent}
                onChange={(e) => setOnTradeAgent(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>На торгового контрагента</span>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={exportTo1C}
                onChange={(e) => setExportTo1C(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>Вивантажувати в 1С</span>
            </label>
          </div>

          {cashOnDelivery && (
            <p className="text-sm text-amber-700">
              Сума післяплати:{" "}
              <span className="font-semibold">
                {codAmountUah.toLocaleString("uk-UA")} ₴
              </span>
            </p>
          )}

          <p className="text-xs text-gray-400">
            {onTradeAgent
              ? "Продаж буде зараховано торговому агенту клієнта."
              : `Продаж зараховано вам (${currentUserName}).`}
          </p>
        </div>
      </section>

      {/* ─── Секція: Позиції ─────────────────────────────────────────────── */}
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

        {/* Скан ШК / ручний ввід / камера */}
        <div className="mb-4">
          <BarcodeInput
            onCode={(c) => void onBarcode(c)}
            error={barcodeError}
          />
        </div>

        {showComment && (
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Коментар
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Будь-які примітки до реалізації (необов'язково)"
              rows={3}
              maxLength={2000}
            />
          </div>
        )}

        <SaleItemsEditor items={items} onChange={setItems} />

        <div className="mt-4">
          <SaleTotals items={items} exchangeRateEur={exchangeRateEur} />
        </div>
      </section>

      {/* ─── Секція: Повідомлення (Viber/share) ──────────────────────────── */}
      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Повідомлення
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasItems}
            onClick={openClientMessage}
          >
            <Send className="mr-1 h-4 w-4" />
            Контрагенту
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasItems}
            onClick={openGroupMessage}
          >
            <Users className="mr-1 h-4 w-4" />У групу
          </Button>
          {/* "У чат" (бот-вихідні) — TODO M1.8 */}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Згенерувати текст і поділитися (Viber / Telegram / WhatsApp /
          копіювати).
        </p>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ─── Дії ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Оплати (як у старій 1С: «Оплата» + «Історія оплат»). Кожна спершу
            зберігає документ, тоді відкриває деталь. */}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!canSubmit}
            onClick={() => void saveAndGoToPayments("pay")}
            title="Зберегти і створити оплату"
          >
            <Wallet className="mr-1 h-4 w-4" />
            Оплата
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canSubmit}
            onClick={() => void saveAndGoToPayments("history")}
            title="Зберегти і переглянути історію оплат"
          >
            <Search className="mr-1 h-4 w-4" />
            Історія оплат
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              router.push(
                isEdit && saleId
                  ? `/manager/sales/${saleId}`
                  : "/manager/sales",
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
                : "Створити реалізацію"}
          </Button>
        </div>
      </div>

      <SaleLotPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        priceTypeCode={priceTypeCode}
        onAddLot={onAddLotFromPicker}
        onAddGeneral={onAddGeneralFromPicker}
      />

      <ShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={shareTitle}
        text={shareText}
      />
    </div>
  );
}
