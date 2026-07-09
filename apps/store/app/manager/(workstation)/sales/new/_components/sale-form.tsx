"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  ListPlus,
  Send,
  Users,
  Wallet,
  Search,
  Receipt,
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
import {
  unitPriceForType,
  autoUnitPrice,
  SELLING_PRICE_TYPES,
} from "@/lib/manager/order-pricing";
import { bagWeightForQuantity } from "@/lib/manager/order-bag-weight";
import { buildPaymentReceiptText } from "@/lib/manager/payment-message";
import {
  reduceToEur,
  reduceChangeToEur,
  computeBalanceEur,
} from "@/lib/manager/cash-order";
import {
  buildClientSaleMessage,
  buildGroupSaleMessage,
  buildPaymentRequisitesText,
  type SaleMessageInput,
  type SaleMessageItem,
} from "@/lib/manager/sale-message";
import {
  isSaleLocked,
  type ManagerSaleStatus,
} from "@/lib/manager/sale-status";
import { useDocumentAutosave } from "@/lib/autosave/use-document-autosave";
import {
  AutosaveStatus,
  RestoreDraftBanner,
} from "../../../_components/autosave-status";
import {
  collectPriceDeviations,
  draftToWire,
  isForeignActiveReservation,
  lineTotalEur,
  type ClientPickerItem,
  type OrderDeliveryOption,
  type PriceDeviation,
  type ProductSummary,
  type SaleEditInitial,
  type SaleItemDraft,
} from "./sale-types";

/**
 * Серіалізований знімок стану форми реалізації — джерело як для локальної копії
 * (рівень 1), так і для серверної чернетки (рівень 2). Має бути JSON-safe.
 */
interface SaleDraftData {
  clientId: string | null;
  clientSummary: ClientPickerItem | null;
  items: SaleItemDraft[];
  notes: string;
  deliveryMethod: string;
  novaPoshtaBranch: string;
  cashOnDelivery: boolean;
  onTradeAgent: boolean;
  expressWaybill: string;
  sellingTypeCode: string;
}

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
  /** Активні банк. рахунки для блоку «Проект оплати» (безнал грн). */
  bankAccounts?: { id: string; name: string }[];
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
  deliveryMethods,
  currentUserId,
  currentUserName,
  routeSheetId,
  returnHref,
  bankAccounts = [],
}: SaleFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";
  /** Куди повертатись після звичайного збереження (МЛ або список). */
  const successHref = returnHref ?? "/manager/sales";

  /**
   * Поточний id збереженого документа. `null` доки чернетку ще не створено
   * (новий документ). Оновлюється або явним POST, або autosave (`onIdAssigned`).
   * Використовується у `saveSale`: якщо є id → PATCH, інакше POST — щоб явне
   * збереження не дублювало вже створену autosave-чернетку.
   */
  const [savedId, setSavedId] = useState<string | null>(saleId ?? null);

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
  // Попередження про відхилення ціни при проведенні (контроль ПеревіркаЦіни).
  const [priceWarn, setPriceWarn] = useState<PriceDeviation[] | null>(null);

  // ─── Повідомлення (Viber/share) ─────────────────────────────────────────
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTitle, setShareTitle] = useState("");
  const [shareText, setShareText] = useState("");

  // ─── Проект оплати (preview, БЕЗ збереження в БД) ────────────────────────
  const [showPaymentDraft, setShowPaymentDraft] = useState(false);
  // Фактична оплата (готівка 3 валюти + безнал грн з рахунком).
  const [payCashUah, setPayCashUah] = useState(0);
  const [payCashlessUah, setPayCashlessUah] = useState(0);
  const [payCashEur, setPayCashEur] = useState(0);
  const [payCashUsd, setPayCashUsd] = useState(0);
  const [payBankAccountId, setPayBankAccountId] = useState("");
  // Решта (здача) — 3 валюти готівкою.
  const [changeUah, setChangeUah] = useState(0);
  const [changeEur, setChangeEur] = useState(0);
  const [changeUsd, setChangeUsd] = useState(0);

  // ─── Менеджерські поля ──────────────────────────────────────────────────
  // Тип цін — дві фіксовані опції (продажна / акційна), відв'язані від
  // MgrPriceType. За замовчуванням «Ціна продажу» (wholesale); при додаванні
  // товару ціна підставляється авто (акційна якщо є — `autoUnitPrice`).
  const [sellingTypeCode, setSellingTypeCode] = useState<string>("wholesale");
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
  const [expressWaybill, setExpressWaybill] = useState(
    initialSale?.expressWaybill ?? "",
  );

  // ─── Автозбереження чернетки (наскрізне, План AUTOSAVE_REALTIME_PLAN) ──────
  // Дворівневий захист: рівень 1 (localStorage) + рівень 2 (жива чернетка в БД).
  // Заблоковані (проведені) документи не автозберігаються — лише перегляд.
  const autosaveEnabled = !isSaleLocked(initialSale?.status ?? "draft");

  const draftData = useMemo<SaleDraftData>(
    () => ({
      clientId,
      clientSummary,
      items,
      notes,
      deliveryMethod,
      novaPoshtaBranch,
      cashOnDelivery,
      onTradeAgent,
      expressWaybill,
      sellingTypeCode,
    }),
    [
      clientId,
      clientSummary,
      items,
      notes,
      deliveryMethod,
      novaPoshtaBranch,
      cashOnDelivery,
      onTradeAgent,
      expressWaybill,
      sellingTypeCode,
    ],
  );

  /** Тіло draft-запиту з знімка форми (спільне для POST/PATCH чернетки). */
  const draftBody = useCallback(
    (d: SaleDraftData): Record<string, unknown> => {
      const wire = d.items
        .map(draftToWire)
        .filter((x): x is NonNullable<typeof x> => x !== null);
      return {
        draft: true,
        items: wire,
        notes: d.notes.trim() || null,
        exchangeRateEur: exchangeRateEur > 0 ? exchangeRateEur : undefined,
        exchangeRateUsd: exchangeRateUsd > 0 ? exchangeRateUsd : undefined,
        priceTypeId: null,
        deliveryMethod: d.deliveryMethod || null,
        novaPoshtaBranch: d.novaPoshtaBranch.trim() || null,
        cashOnDelivery: d.cashOnDelivery,
        assignedAgentUserId: d.onTradeAgent ? null : currentUserId,
        onTradeAgent: d.onTradeAgent,
        expressWaybill: d.expressWaybill.trim() || null,
      };
    },
    [exchangeRateEur, exchangeRateUsd, currentUserId],
  );

  const createDraftServer = useCallback(
    async (d: SaleDraftData): Promise<string> => {
      const res = await fetch("/api/v1/manager/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draftBody(d),
          customerId: d.clientId,
          ...(routeSheetId ? { routeSheetId } : {}),
        }),
      });
      if (!res.ok) throw new Error(`draft create ${res.status}`);
      const j = (await res.json()) as { id: string };
      return j.id;
    },
    [draftBody, routeSheetId],
  );

  const updateDraftServer = useCallback(
    async (id: string, d: SaleDraftData): Promise<void> => {
      const res = await fetch(`/api/v1/manager/sales/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftBody(d)),
      });
      if (!res.ok) throw new Error(`draft update ${res.status}`);
    },
    [draftBody],
  );

  const autosave = useDocumentAutosave<SaleDraftData>({
    docType: "sale",
    existingId: saleId ?? null,
    data: draftData,
    enabled: autosaveEnabled,
    // Новий документ: серверна чернетка можлива лише коли обрано клієнта
    // (`Sale.customerId` — обов'язковий FK). До того захищає localStorage.
    canCreateDraft: clientId != null,
    createDraft: createDraftServer,
    updateDraft: updateDraftServer,
    onIdAssigned: (id) => {
      setSavedId(id);
      // Міняємо URL без remount форми (рефреш відкриє чернетку з БД).
      window.history.replaceState(null, "", `/manager/sales/${id}`);
    },
  });

  /** Застосувати відновлені з localStorage дані у стан форми. */
  function applyRestore(d: SaleDraftData): void {
    setClientId(d.clientId);
    setClientSummary(d.clientSummary);
    setItems(d.items);
    setNotes(d.notes);
    setShowComment(!!d.notes.trim());
    setDeliveryMethod(d.deliveryMethod);
    setNovaPoshtaBranch(d.novaPoshtaBranch);
    setCashOnDelivery(d.cashOnDelivery);
    setOnTradeAgent(d.onTradeAgent);
    setExpressWaybill(d.expressWaybill);
    setSellingTypeCode(d.sellingTypeCode);
    autosave.acceptRestore();
  }

  /**
   * Перерахунок цін за кг усіх рядків під обраний тип цін (override, як у 1С):
   *  - `wholesale` → форс продажної ціни кожного рядка (isAkciya=false);
   *  - `akciya`    → акційна-де-є (`autoUnitPrice`), з прапором isAkciya.
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
        return {
          ...row,
          pricePerKg: unit,
          priceEur: lineTotalEur(unit, row.weight),
          isAkciya,
        };
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
    if (summary) {
      // Тип цін більше не залежить від клієнта (дві фіксовані опції) — лише
      // підтягуємо спосіб доставки.
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
      const { isAkciya } = autoUnitPrice(pick.product.prices);
      const draft: SaleItemDraft = {
        uid: newUid(),
        product: pick.product,
        lotId: pick.lotId,
        barcode: pick.barcode,
        quantity: 1,
        weight,
        pricePerKg: unit,
        priceEur: lineTotalEur(unit, weight),
        isAkciya,
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
    const { isAkciya } = autoUnitPrice(product.prices);
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
                priceEur: lineTotalEur(unit, weight),
                isAkciya,
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
        priceEur: lineTotalEur(unit, weight),
        isAkciya,
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

      // Чужа активна бронь мішка (1С АктивнаБроньМішка) — не додаємо рядок.
      if (isForeignActiveReservation(data.lot, currentUserId, Date.now())) {
        const until = data.lot.reservedUntil
          ? new Date(data.lot.reservedUntil).toLocaleDateString("uk-UA")
          : "";
        setBarcodeError(
          `Активна бронь мішка до ${until}` +
            (data.lot.reservedByName
              ? ` (заброньовано: ${data.lot.reservedByName})`
              : ""),
        );
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
      const auto = autoUnitPrice(data.prices);
      const unit = auto.unit ?? 0;
      const weight = data.lot.weight > 0 ? data.lot.weight : 0;

      const draft: SaleItemDraft = {
        uid: newUid(),
        product,
        lotId: data.lot.id,
        barcode: data.lot.barcode,
        quantity: 1,
        weight,
        pricePerKg: unit,
        priceEur: lineTotalEur(unit, weight),
        isAkciya: auto.isAkciya,
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
    post = false,
  ): Promise<string | null> {
    // `savedId` існує коли документ уже створено (edit-режим АБО autosave вже
    // створив чернетку). Тоді — PATCH; інакше — POST нового документа.
    const effectiveId = savedId;
    const usePatch = effectiveId != null;
    if (!usePatch && !clientId) return null;
    setSubmitting(true);
    setError(null);
    try {
      // Перед явним записом — гасимо чергу autosave, щоб відкладений draft-PATCH
      // не перезаписав проведений/збережений документ після цього запиту.
      autosave.clearAll();
      // Fix 3: «На торгового контрагента» → продаж зараховується агенту клієнта
      // (1С сам визначає кого) → assignedAgentUserId=null; інакше — поточний
      // продавець.
      const payloadAgent = onTradeAgent ? null : currentUserId;
      const url = usePatch
        ? `/api/v1/manager/sales/${effectiveId}`
        : "/api/v1/manager/sales";
      const res = await fetch(url, {
        method: usePatch ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(usePatch ? {} : { customerId: clientId }),
          items: wireItems,
          notes: notes.trim() || (usePatch ? null : undefined),
          exchangeRateEur: exchangeRateEur > 0 ? exchangeRateEur : undefined,
          exchangeRateUsd: exchangeRateUsd > 0 ? exchangeRateUsd : undefined,
          // Тип цін відв'язаний від MgrPriceType (wholesale/akciya — НЕ id) —
          // менеджерська ціна фіксується у рядках. На документ пишемо null.
          priceTypeId: null,
          deliveryMethod: deliveryMethod || null,
          novaPoshtaBranch: novaPoshtaBranch.trim() || null,
          cashOnDelivery,
          assignedAgentUserId: payloadAgent,
          onTradeAgent,
          expressWaybill: expressWaybill.trim() || null,
          ...(usePatch ? {} : { routeSheetId: routeSheetId ?? undefined }),
          ...(usePatch && nextStatus ? { status: nextStatus } : {}),
          ...(post ? { post: true } : {}),
        }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(errBody.error ?? `Помилка ${res.status}`);
        return null;
      }
      if (usePatch) {
        return effectiveId;
      }
      const sale = (await res.json()) as { id: string };
      setSavedId(sale.id);
      return sale.id;
    } catch (e) {
      setError((e as Error).message ?? "Невідома помилка");
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Основне збереження — після успіху → список реалізацій (Fix 6).
   * `post=true` → проводимо документ (статус `posted` + `archived`).
   */
  async function submit(
    post = false,
    nextStatus?: ManagerSaleStatus,
  ): Promise<void> {
    const id = await saveSale(nextStatus, post);
    if (id === null) return;
    // Статусний перехід у edit лишає менеджера на сторінці (бачить новий стан).
    if (isEdit && nextStatus) {
      router.refresh();
      return;
    }
    // МЛ-контекст → назад на сторінку Маршрутного листа; інакше — список.
    router.push(successHref);
  }

  /**
   * «Зберегти та провести» з контролем відхилення ціни (1С ПеревіркаЦіни):
   * якщо ціна/кг рядка відхиляється від еталонної (тип цін) > 0.20 € — спершу
   * показуємо діалог-підтвердження зі списком позицій; лише «Все одно провести»
   * реально проводить документ. Для чернетки («Зберегти») контроль не діє.
   */
  function requestPost(): void {
    const deviations = collectPriceDeviations(items);
    if (deviations.length > 0) {
      setPriceWarn(deviations);
      return;
    }
    void submit(true);
  }

  /** Підтвердження з діалогу відхилення ціни → проводимо. */
  function confirmPostDespiteDeviation(): void {
    setPriceWarn(null);
    void submit(true);
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

  // ─── Проект оплати: live-зведення у EUR (порт 1С §B, без збереження) ──────
  const draftPaidEur = reduceToEur(
    {
      uah: payCashUah,
      eur: payCashEur,
      usd: payCashUsd,
      uahCashless: payCashlessUah,
    },
    { eur: exchangeRateEur, usd: exchangeRateUsd },
  );
  const draftChangeEur = reduceChangeToEur(
    { uah: changeUah, eur: changeEur, usd: changeUsd },
    { eur: exchangeRateEur, usd: exchangeRateUsd },
  );
  const paymentBalanceEur = computeBalanceEur({
    sumToPayEur: totalEur,
    paidEur: draftPaidEur,
    changeEur: draftChangeEur,
  });

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
      region: clientSummary?.region ?? null,
      city: clientSummary?.city ?? null,
      phone: clientSummary?.phone ?? null,
      deliveryMethod: deliveryMethod || null,
      novaPoshtaBranch: novaPoshtaBranch.trim() || null,
      items: messageItems,
      totalEur,
      exchangeRateEur,
      exchangeRateUsd,
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

  /** Реквізити оплати (ФОП) з підсумковою сумою грн — без позицій. */
  function openRequisitesMessage(): void {
    setShareTitle("Реквізити оплати");
    setShareText(buildPaymentRequisitesText(totalEur * exchangeRateEur));
    setShareOpen(true);
  }

  /**
   * Проект оплати → текст-квитанція «Оплата» у ShareSheet. Нічого не зберігає
   * в БД (preview-генератор); реальний запис оплати — окремий потік («Оплата»/
   * «Історія оплат»).
   */
  function openPaymentDraftMessage(): void {
    const acct =
      bankAccounts.find((a) => a.id === payBankAccountId)?.name ?? null;
    setShareTitle("Оплата (проект)");
    setShareText(
      buildPaymentReceiptText({
        clientName: clientSummary?.name ?? "",
        paid: {
          uah: payCashUah,
          eur: payCashEur,
          usd: payCashUsd,
          uahCashless: payCashlessUah,
        },
        change: { uah: changeUah, eur: changeEur, usd: changeUsd },
        bankAccountName: acct,
        rates: { eur: exchangeRateEur, usd: exchangeRateUsd },
        sumToPayEur: totalEur,
        cashOnDelivery,
        codAmountUah: cashOnDelivery ? codAmountUah : null,
      }),
    );
    setShareOpen(true);
  }

  return (
    <div className="space-y-4">
      {autosave.restoreData && (
        <RestoreDraftBanner
          onRestore={() => applyRestore(autosave.restoreData as SaleDraftData)}
          onDismiss={autosave.dismissRestore}
        />
      )}

      {/* ─── Секція: Контрагент ──────────────────────────────────────────── */}
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
      <section className="rounded-lg border bg-white p-4 shadow-sm">
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
      <section className="rounded-lg border bg-white p-4 shadow-sm">
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openRequisitesMessage}
          >
            <Receipt className="mr-1 h-4 w-4" />
            Скинути реквізити
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPaymentDraft((v) => !v)}
          >
            <Wallet className="mr-1 h-4 w-4" />
            Проект оплати
          </Button>
          {/* "У чат" (бот-вихідні) — TODO M1.8 */}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Згенерувати текст і поділитися (Viber / Telegram / WhatsApp /
          копіювати).
        </p>

        {/* ─── Проект оплати (preview, нічого не зберігає) ─────────────────── */}
        {showPaymentDraft && (
          <div className="mt-4 rounded-lg border bg-gray-50 p-4 text-sm">
            <div className="text-gray-700">
              До сплати:{" "}
              <span className="font-semibold text-gray-900">
                {totalEur.toFixed(2)} €
              </span>{" "}
              <span className="text-gray-500">
                ({(totalEur * exchangeRateEur).toFixed(2)} грн)
              </span>
            </div>

            {/* Фактична оплата */}
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Фактична оплата
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="pay-cash-uah"
                    className="mb-1 block text-xs text-gray-500"
                  >
                    Готівка грн
                  </label>
                  <input
                    id="pay-cash-uah"
                    type="number"
                    min={0}
                    step="0.01"
                    value={payCashUah}
                    onChange={(e) => setPayCashUah(Number(e.target.value) || 0)}
                    className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="pay-cashless-uah"
                    className="mb-1 block text-xs text-gray-500"
                  >
                    Безнал грн
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="pay-cashless-uah"
                      type="number"
                      min={0}
                      step="0.01"
                      value={payCashlessUah}
                      onChange={(e) =>
                        setPayCashlessUah(Number(e.target.value) || 0)
                      }
                      className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    <select
                      aria-label="Банк. рахунок"
                      value={payBankAccountId}
                      onChange={(e) => setPayBankAccountId(e.target.value)}
                      className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                    >
                      <option value="">— рахунок —</option>
                      {bankAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="pay-cash-eur"
                    className="mb-1 block text-xs text-gray-500"
                  >
                    Готівка €
                  </label>
                  <input
                    id="pay-cash-eur"
                    type="number"
                    min={0}
                    step="0.01"
                    value={payCashEur}
                    onChange={(e) => setPayCashEur(Number(e.target.value) || 0)}
                    className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="pay-cash-usd"
                    className="mb-1 block text-xs text-gray-500"
                  >
                    Готівка $
                  </label>
                  <input
                    id="pay-cash-usd"
                    type="number"
                    min={0}
                    step="0.01"
                    value={payCashUsd}
                    onChange={(e) => setPayCashUsd(Number(e.target.value) || 0)}
                    className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              </div>
            </div>

            {/* Решта */}
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Решта
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="change-uah"
                    className="mb-1 block text-xs text-gray-500"
                  >
                    грн
                  </label>
                  <input
                    id="change-uah"
                    type="number"
                    min={0}
                    step="0.01"
                    value={changeUah}
                    onChange={(e) => setChangeUah(Number(e.target.value) || 0)}
                    className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="change-eur"
                    className="mb-1 block text-xs text-gray-500"
                  >
                    €
                  </label>
                  <input
                    id="change-eur"
                    type="number"
                    min={0}
                    step="0.01"
                    value={changeEur}
                    onChange={(e) => setChangeEur(Number(e.target.value) || 0)}
                    className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="change-usd"
                    className="mb-1 block text-xs text-gray-500"
                  >
                    $
                  </label>
                  <input
                    id="change-usd"
                    type="number"
                    min={0}
                    step="0.01"
                    value={changeUsd}
                    onChange={(e) => setChangeUsd(Number(e.target.value) || 0)}
                    className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              </div>
            </div>

            {/* Live-зведення */}
            <div className="mt-4 space-y-1 border-t pt-3">
              <div className="text-gray-700">
                Оплачено:{" "}
                <span className="font-semibold text-gray-900">
                  {draftPaidEur.toFixed(2)} €
                </span>
              </div>
              {draftChangeEur > 0 && (
                <div className="text-gray-700">
                  Решта:{" "}
                  <span className="font-semibold text-gray-900">
                    {draftChangeEur.toFixed(2)} €
                  </span>
                </div>
              )}
              {paymentBalanceEur > 0 ? (
                <div className="font-semibold text-amber-700">
                  Борг: {paymentBalanceEur.toFixed(2)} €
                </div>
              ) : paymentBalanceEur < 0 ? (
                <div className="font-semibold text-green-700">
                  Переплата: {(-paymentBalanceEur).toFixed(2)} €
                </div>
              ) : (
                <div className="font-semibold text-green-700">
                  Сплачено повністю
                </div>
              )}
            </div>

            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openPaymentDraftMessage}
              >
                <Receipt className="mr-1 h-4 w-4" />
                Скинути оплату
              </Button>
            </div>
          </div>
        )}
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

        <div className="flex flex-wrap items-center gap-3">
          {autosaveEnabled && (
            <AutosaveStatus
              status={autosave.status}
              savedAt={autosave.savedAt}
              className="mr-1"
            />
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              router.push(
                savedId ? `/manager/sales/${savedId}` : "/manager/sales",
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
            onClick={() => submit(false)}
          >
            {submitting ? "Збереження…" : "Зберегти"}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={requestPost}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            {submitting ? "Збереження…" : "Зберегти та провести"}
          </Button>
        </div>
      </div>

      <SaleLotPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onAddLot={onAddLotFromPicker}
        onAddGeneral={onAddGeneralFromPicker}
      />

      <ShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={shareTitle}
        text={shareText}
      />

      {/* Діалог контролю відхилення ціни (без window.confirm — блокується в
          iframe-менеджерці). Показується лише при проведенні з відхиленням. */}
      {priceWarn && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onMouseDown={() => setPriceWarn(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-900">
              Ціна відхиляється від типу цін
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Наступні позиції мають ціну, що відрізняється від рекомендованої
              більш ніж на 0,20 €:
            </p>
            <ul className="mt-3 max-h-60 space-y-1 overflow-y-auto rounded border bg-gray-50 p-3 text-sm">
              {priceWarn.map((d, i) => (
                <li key={i} className="text-gray-700">
                  <span className="font-medium text-gray-900">{d.name}</span>:
                  має бути{" "}
                  <span className="font-semibold">
                    {d.expected.toFixed(2)} €
                  </span>
                  , введено{" "}
                  <span className="font-semibold text-amber-700">
                    {d.actual.toFixed(2)} €
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPriceWarn(null)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={confirmPostDespiteDeviation}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
              >
                Все одно провести
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
