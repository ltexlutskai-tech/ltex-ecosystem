"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  MessagesSquare,
  ListPlus,
  Send,
  Users,
  Wallet,
  Search,
  Receipt,
} from "lucide-react";
import { Button, Textarea, useToast } from "@ltex/ui";
import { ClientPicker } from "../../../orders/new/_components/client-picker";
import { ShareSheet } from "../../../prices/_components/share-sheet";
import { PickConversationDialog } from "../../../messenger/_components/pick-conversation-dialog";
import { SaleItemsEditor } from "./sale-items-editor";
import { SaleTotals } from "./sale-totals";
import { BarcodeInput } from "./barcode-input";
import {
  SaleLotPicker,
  type SaleGeneralPick,
  type SaleLotPick,
} from "./sale-lot-picker";
import { autoUnitPrice } from "@/lib/manager/order-pricing";
import {
  classifyDelivery,
  findDeliveryCode,
} from "@/lib/manager/order-delivery";
import { bagWeightForQuantity } from "@/lib/manager/order-bag-weight";
import {
  buildClientSaleMessage,
  buildGroupSaleMessage,
  buildPaymentRequisitesText,
  buildPrepaymentRequisitesText,
  type SaleMessageInput,
  type SaleMessageItem,
} from "@/lib/manager/sale-message";
import {
  isSaleLocked,
  type ManagerSaleStatus,
} from "@/lib/manager/sale-status";
import { useDocumentAutosave } from "@/lib/autosave/use-document-autosave";
import { AutosaveStatus } from "../../../_components/autosave-status";
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
  deliveryAddress: string;
  cashOnDelivery: boolean;
  onTradeAgent: boolean;
  expressWaybill: string;
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
  /**
   * Сума вже отриманих оплат по цій реалізації (грн) — для «Скинути реквізити»
   * (фактична сума до оплати = сума документа − отримано). У режимі створення 0.
   */
  alreadyReceivedUah?: number;
}

/** Передоплата за один лот (мішок), грн. Мінімальна сума передоплати = 1 лот. */
const PREPAYMENT_PER_LOT_UAH = 500;

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
  alreadyReceivedUah = 0,
}: SaleFormProps) {
  const router = useRouter();
  const { toast } = useToast();
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

  // ─── Реквізити передоплати (500 грн/лот) ─────────────────────────────────
  const [showPrepayment, setShowPrepayment] = useState(false);
  // К-сть лотів для передоплати — редагована (дефолт = к-сть мішків реалізації).
  const [prepayLotCountRaw, setPrepayLotCountRaw] = useState("");

  // ─── Надсилання «У наш месенджер» (внутрішній чат, у групи) ───────────────
  const [pickConvOpen, setPickConvOpen] = useState(false);
  const [sendingToConv, setSendingToConv] = useState(false);

  // ─── Менеджерські поля ──────────────────────────────────────────────────
  // Тип цін як окреме поле прибрано (рішення user): при додаванні товару ціна
  // підставляється авто (акційна якщо є — `autoUnitPrice`, інакше продажна) і
  // редагується вручну у рядку.
  const [deliveryMethod, setDeliveryMethod] = useState<string>(
    initialSale?.deliveryMethod ??
      // Реалізації з маршрутного листа за замовчуванням «Доставка».
      (routeSheetId
        ? (findDeliveryCode(deliveryMethods) ?? "delivery")
        : mapClientDelivery(
            initialClient?.deliveryMethodCode,
            deliveryMethods,
          )),
  );
  const [novaPoshtaBranch, setNovaPoshtaBranch] = useState(
    initialSale?.novaPoshtaBranch ?? "",
  );
  // Адреса доставки (спосіб «Доставка») — з картки клієнта або вручну.
  const [deliveryAddress, setDeliveryAddress] = useState(
    initialSale?.deliveryAddress ?? initialClient?.address ?? "",
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

  // Категорія доставки → які поля показувати (НП/ТТН — пошта; Адреса — доставка).
  const deliveryKind = classifyDelivery(
    deliveryMethod,
    deliveryMethods.find((o) => o.code === deliveryMethod)?.label,
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
      deliveryAddress,
      cashOnDelivery,
      onTradeAgent,
      expressWaybill,
    }),
    [
      clientId,
      clientSummary,
      items,
      notes,
      deliveryMethod,
      novaPoshtaBranch,
      deliveryAddress,
      cashOnDelivery,
      onTradeAgent,
      expressWaybill,
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
        deliveryAddress: d.deliveryAddress.trim() || null,
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
    // Банер «Знайдено незбережені зміни» не показуємо — чернетки зберігаються у
    // БД і доступні у списку реалізацій (рішення user).
    enableRestore: false,
    createDraft: createDraftServer,
    updateDraft: updateDraftServer,
    onIdAssigned: (id) => {
      setSavedId(id);
      // Міняємо URL без remount форми (рефреш відкриє чернетку з БД).
      window.history.replaceState(null, "", `/manager/sales/${id}`);
    },
  });

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
          // НП/ТТН зберігаємо лише для «Пошта», адресу — лише для «Доставка».
          novaPoshtaBranch:
            deliveryKind === "post" ? novaPoshtaBranch.trim() || null : null,
          deliveryAddress:
            deliveryKind === "delivery" ? deliveryAddress.trim() || null : null,
          cashOnDelivery,
          assignedAgentUserId: payloadAgent,
          onTradeAgent,
          expressWaybill:
            deliveryKind === "post" ? expressWaybill.trim() || null : null,
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

  const totalEur = items
    .filter((i) => i.product)
    .reduce((s, i) => s + (i.priceEur || 0), 0);
  // Сума післяплати (грн) — округлення повної суми документа.
  const totalUahRounded = Math.round(totalEur * exchangeRateEur);
  const codAmountUah = totalUahRounded;

  // Фактична сума до оплати (грн) з урахуванням уже отриманих оплат по цій
  // реалізації (передоплати/оплати). У режимі створення отримано = 0.
  const remainingUah = Math.max(0, totalUahRounded - alreadyReceivedUah);

  // ─── Реквізити передоплати (500 грн/лот) ─────────────────────────────────
  // К-сть мішків реалізації (дефолт для поля «кількість лотів»).
  const totalBags = items
    .filter((i) => i.product)
    .reduce((s, i) => s + (i.quantity || 0), 0);
  const prepayLotCount = (() => {
    const raw = prepayLotCountRaw.trim();
    if (raw === "") return Math.max(1, totalBags);
    const n = Math.floor(Number(raw.replace(",", ".")));
    return Number.isFinite(n) && n > 0 ? n : 1;
  })();
  // Мінімальна сума передоплати — 500 грн (щонайменше 1 лот).
  const prepaymentUah = Math.max(
    PREPAYMENT_PER_LOT_UAH,
    prepayLotCount * PREPAYMENT_PER_LOT_UAH,
  );

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

  /**
   * Реквізити оплати (ФОП) з ФАКТИЧНОЮ сумою до оплати — без позицій.
   * Фактична сума = сума документа − уже отримані оплати (передоплати).
   */
  function openRequisitesMessage(): void {
    setShareTitle("Реквізити оплати");
    setShareText(buildPaymentRequisitesText(remainingUah));
    setShareOpen(true);
  }

  /** Реквізити ПЕРЕДОПЛАТИ (500 грн/лот) — сума = к-сть лотів × 500 грн. */
  function openPrepaymentMessage(): void {
    setShareTitle("Реквізити передоплати");
    setShareText(buildPrepaymentRequisitesText(prepaymentUah, prepayLotCount));
    setShareOpen(true);
  }

  /**
   * «У наш месенджер» — надсилає текст групового повідомлення у вибрану розмову
   * (групу) внутрішнього месенджера L-TEX. Основний сценарій — закидати
   * повідомлення у робочі групи.
   */
  async function sendGroupToConversation(
    conversationId: string,
  ): Promise<void> {
    if (sendingToConv) return;
    setSendingToConv(true);
    try {
      const text = buildGroupSaleMessage(buildMessageInput());
      const res = await fetch(
        `/api/v1/manager/messenger/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Помилка ${res.status}`);
      }
      setPickConvOpen(false);
      toast({ description: "Надіслано у месенджер ✓" });
    } catch (e) {
      toast({
        description: e instanceof Error ? e.message : "Не вдалось надіслати",
        variant: "destructive",
      });
    } finally {
      setSendingToConv(false);
    }
  }

  return (
    <div className="space-y-4">
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
              €
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

          {/* № відділення НП — лише для «Пошта». */}
          {deliveryKind === "post" && (
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
          )}

          {/* Адреса доставки — лише для «Доставка». */}
          {deliveryKind === "delivery" && (
            <div className="sm:col-span-2">
              <label
                htmlFor="sale-delivery-address"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Адреса доставки
              </label>
              <input
                id="sale-delivery-address"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                maxLength={500}
                placeholder="місто, вулиця, будинок (з картки клієнта або вручну)"
                className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          )}

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

          {/* ТТН — лише для «Пошта». */}
          {deliveryKind === "post" && (
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
          )}
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

        {/* Чекбокси. «Наложку (післяплату)» винесено вниз до блоку оплати —
            це супутній платіжний функціонал (рішення user). */}
        <div className="mt-4 flex flex-col gap-3 border-t pt-4">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={onTradeAgent}
              onChange={(e) => setOnTradeAgent(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <span>На торгового контрагента</span>
          </label>

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
            disabled={!hasItems || sendingToConv}
            onClick={() => setPickConvOpen(true)}
          >
            <MessagesSquare className="mr-1 h-4 w-4" />У наш месенджер
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
            onClick={() => setShowPrepayment((v) => !v)}
          >
            <Wallet className="mr-1 h-4 w-4" />
            Реквізити передоплати
          </Button>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Згенерувати текст і поділитися (Viber / Telegram / WhatsApp /
          копіювати).
        </p>

        {/* ─── Реквізити передоплати (500 грн/лот) ─────────────────────────── */}
        {showPrepayment && (
          <div className="mt-4 rounded-lg border bg-gray-50 p-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="prepay-lots"
                  className="mb-1 block text-xs text-gray-500"
                >
                  Кількість лотів (мішків)
                </label>
                <input
                  id="prepay-lots"
                  type="number"
                  min={1}
                  step={1}
                  value={prepayLotCountRaw}
                  onChange={(e) => setPrepayLotCountRaw(e.target.value)}
                  placeholder={String(Math.max(1, totalBags))}
                  className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                <p className="mt-1 text-xs text-gray-400">
                  По {PREPAYMENT_PER_LOT_UAH} грн за лот. За замовчуванням —
                  к-сть мішків реалізації.
                </p>
              </div>
              <div className="flex flex-col justify-center">
                <div className="text-gray-700">
                  Сума передоплати:{" "}
                  <span className="font-semibold text-gray-900">
                    {prepaymentUah.toLocaleString("uk-UA")} грн
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {prepayLotCount} × {PREPAYMENT_PER_LOT_UAH} грн
                </div>
              </div>
            </div>
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openPrepaymentMessage}
              >
                <Receipt className="mr-1 h-4 w-4" />
                Скинути реквізити передоплати
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ─── Наложка (перенесено вниз, поряд з оплатою — рішення user) ─────── */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={cashOnDelivery}
            onChange={(e) => setCashOnDelivery(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          <span className="font-medium">Наложка (післяплата)</span>
        </label>
        {cashOnDelivery && (
          <p className="mt-2 text-sm text-amber-700">
            Сума післяплати:{" "}
            <span className="font-semibold">
              {codAmountUah.toLocaleString("uk-UA")} ₴
            </span>
          </p>
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

      {/* «У наш месенджер» — вибір розмови/групи внутрішнього чату. */}
      <PickConversationDialog
        open={pickConvOpen}
        onOpenChange={setPickConvOpen}
        title="Надіслати у месенджер"
        busy={sendingToConv}
        onPick={(conversationId) =>
          void sendGroupToConversation(conversationId)
        }
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
