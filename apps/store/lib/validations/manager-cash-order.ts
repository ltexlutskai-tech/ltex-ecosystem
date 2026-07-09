import { z } from "zod";

/**
 * Zod schema для POST /api/v1/manager/cash-orders body (Блок «Реалізація»,
 * Етап 4 — касовий ордер / каса).
 *
 * Оплата прихідного касового ордера (`type=income`) по реалізації у 3 валютах
 * (грн/EUR/USD) + безнал грн. Здача обчислюється на сервері через курси-знімок
 * реалізації; при здачі > 0 авто-створюється другий ордер-розхід.
 *
 * Суми зберігаються «сирими» по валюті; усі порівняння йдуть через грн.
 */
const MAX_AMOUNT = 10_000_000;

const amountField = z.number().nonnegative().max(MAX_AMOUNT).default(0);

export const CHANGE_CURRENCIES = ["UAH", "EUR", "USD"] as const;
export type ChangeCurrency = (typeof CHANGE_CURRENCIES)[number];

export const createCashOrderSchema = z
  .object({
    saleId: z.string().min(1),
    /** Готівка, грн. */
    amountUah: amountField,
    /** Готівка, EUR. */
    amountEur: amountField,
    /** Готівка, USD. */
    amountUsd: amountField,
    /** Безготівка, грн. */
    amountUahCashless: amountField,
    /** Банківський рахунок (для безналу). */
    bankAccount: z.string().max(120).optional(),
    /** Стаття руху коштів. */
    cashFlowArticle: z.string().max(120).optional(),
    comment: z.string().max(2000).optional(),
    /** Валюта здачі (для авто-ордера розходу). */
    changeCurrency: z.enum(CHANGE_CURRENCIES).optional().default("UAH"),
  })
  .refine(
    (v) => v.amountUah + v.amountEur + v.amountUsd + v.amountUahCashless > 0,
    {
      message: "Має бути вказана хоча б одна сума оплати > 0",
      path: ["amountUah"],
    },
  );

export type CreateCashOrderInput = z.infer<typeof createCashOrderSchema>;
/** Pre-parse shape (defaults optional) — приймається `createCashOrderWithChange`. */
export type CreateCashOrderInputRaw = z.input<typeof createCashOrderSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Блок «Оплати / Каса» — Етап 2. Payment-форма (порт 1С обробки «Оплата»).
//
// EUR-base модель: курси-знімок (`rateEur`/`rateUsd` = грн за €/$), 4 канали
// фактичної оплати + ручна решта у 3 валютах. Підстава — реалізація (`saleId`)
// АБО клієнт (`clientId` = MgrClient.id; резолвиться у Customer через code1C).
// ─────────────────────────────────────────────────────────────────────────────

export const CASH_FLOW_DIRECTIONS = ["income", "expense"] as const;
export type CashFlowDirection = (typeof CASH_FLOW_DIRECTIONS)[number];

export const processPaymentSchema = z
  .object({
    /** Реалізація-підстава (опц.). Хоча б одне з {saleId, clientId} обов'язкове. */
    saleId: z.string().min(1).optional(),
    /** Клієнт (MgrClient.id) для оплати без реалізації. */
    clientId: z.string().min(1).optional(),
    /** Вид руху коштів. */
    type: z.enum(CASH_FLOW_DIRECTIONS).default("income"),
    // Фактична оплата (4 канали).
    amountUah: amountField,
    amountEur: amountField,
    amountUsd: amountField,
    amountUahCashless: amountField,
    // Ручна решта (3 валюти).
    changeUah: amountField,
    changeEur: amountField,
    changeUsd: amountField,
    /** Банківський рахунок (довідник) — для безналу. */
    bankAccountId: z.string().min(1).optional(),
    /** Стаття руху коштів (довідник) — обов'язкова для Приходу і Розходу. */
    cashFlowArticleId: z.string().min(1).optional(),
    comment: z.string().max(2000).optional(),
    /** true = «Провести» (ДДС+борг+архів); false = «Зберегти» (чернетка). */
    post: z.boolean().optional().default(true),
    /** Курси-знімок (грн за €/$). */
    rateEur: z.number().positive().max(MAX_AMOUNT),
    rateUsd: z.number().positive().max(MAX_AMOUNT),
    /** «До оплати» (база EUR). */
    sumToPayEur: z.number().nonnegative().max(MAX_AMOUNT),
    /** Інформаційно — форма вже згорнула борг у sumToPayEur. */
    includeDebt: z.boolean().optional().default(false),
    /**
     * Зворотне посилання на Маршрутний лист (1С `КассовыйОрдер.МаршрутныйЛист`).
     * Заповнюється коли оплату створено зсередини МЛ
     * (`/manager/payments/new?routeSheetId=...`). Ставиться на income + change
     * ордери. Існування МЛ перевіряє endpoint.
     */
    routeSheetId: z.string().min(1).optional(),
  })
  .refine((v) => v.saleId || v.clientId, {
    message: "Потрібна реалізація або клієнт",
    path: ["saleId"],
  })
  .refine(
    (v) =>
      v.amountUah + v.amountEur + v.amountUsd + v.amountUahCashless > 0 ||
      v.type === "expense",
    {
      message: "Має бути вказана хоча б одна сума оплати > 0",
      path: ["amountUah"],
    },
  )
  .refine((v) => Boolean(v.cashFlowArticleId), {
    message: "Стаття руху коштів обов'язкова",
    path: ["cashFlowArticleId"],
  });

export type ProcessPaymentInput = z.infer<typeof processPaymentSchema>;
export type ProcessPaymentInputRaw = z.input<typeof processPaymentSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Автозбереження чернетки (draft) касового ордера — План AUTOSAVE_REALTIME_PLAN.
//
// Послаблена версія `processPaymentSchema`: усі поля опційні (жодних `.refine`),
// щоб чернетка зберігалась «з першого символу» навіть напівпорожня. Обирається у
// POST/PATCH коли body містить `draft === true`.
//
// ⚠️ Грошова безпека: draft НЕ проводить документ і НЕ рахує здачу/борг/ДДС.
// Він пише ЛИШЕ один рядок `MgrCashOrder` зі `status="draft"` без ефектів
// проведення (`applyCashOrderPostingEffects` тут не викликається) і без
// авто-ордера здачі. Повна оплата (здача + рухи ДДС + борг) — ЛИШЕ при
// «Провести» (`processPaymentSchema`).
// ─────────────────────────────────────────────────────────────────────────────

const draftAmountField = z.number().nonnegative().max(MAX_AMOUNT).optional();

export const cashOrderDraftSchema = z.object({
  /** Прапорець draft-режиму — endpoint обирає цю схему коли `true`. */
  draft: z.literal(true),
  saleId: z.string().min(1).nullable().optional(),
  clientId: z.string().min(1).nullable().optional(),
  type: z.enum(CASH_FLOW_DIRECTIONS).optional(),
  amountUah: draftAmountField,
  amountEur: draftAmountField,
  amountUsd: draftAmountField,
  amountUahCashless: draftAmountField,
  bankAccountId: z.string().min(1).nullable().optional(),
  cashFlowArticleId: z.string().min(1).nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
  /** Курси-знімок (грн за €/$) — опційні для чернетки. */
  rateEur: z.number().nonnegative().max(MAX_AMOUNT).optional(),
  rateUsd: z.number().nonnegative().max(MAX_AMOUNT).optional(),
  routeSheetId: z.string().min(1).nullable().optional(),
});

export type CashOrderDraftInput = z.infer<typeof cashOrderDraftSchema>;

/**
 * Zod schema для POST /api/v1/manager/cash-orders/discount-remainder
 * (1С `ДатьСкидкуНаОстаток`). Зменшує найдорожчий рядок реалізації на залишок.
 */
export const discountRemainderSchema = z.object({
  saleId: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  /** Залишок документа у EUR (>0 борг, <0 переплата). Гард по порогу — у коді. */
  remainderEur: z.number().max(MAX_AMOUNT).min(-MAX_AMOUNT),
  rateEur: z.number().positive().max(MAX_AMOUNT),
  rateUsd: z.number().positive().max(MAX_AMOUNT),
});

export type DiscountRemainderInput = z.infer<typeof discountRemainderSchema>;
