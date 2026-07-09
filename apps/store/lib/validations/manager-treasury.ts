import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Задача D — казначейські документи (банк/каса). Zod-схеми створення.
//
// Три документи (моделі вже у схемі, міграція `20260617_financial_documents`):
//   • BankPaymentIncoming — надходження безналу від клієнта (проведення зменшує
//     борг клієнта через MgrDebtMovement + прихід ДДС на рахунок);
//   • BankPaymentOutgoing — вихідний платіж постачальнику (розхід ДДС, борг не
//     зачіпає);
//   • CashTransfer — інкасація каса↔банк / переміщення каса↔каса (2 рухи ДДС).
//
// Валюта документа: UAH | EUR. `rateEur` — курс-знімок (грн за €), за яким сума
// зводиться до EUR (`amountEur`) на сервері при створенні. USD у казначейських
// документах НЕ підтримуємо (немає окремого курсу USD, а бізнес — у EUR/UAH);
// USD-готівка обліковується касовим ордером, не банк-документами. У L-TEX одна
// каса (сентинел `CASH` у рухах ДДС), тому окремого довідника кас немає.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_AMOUNT = 100_000_000;

export const TREASURY_CURRENCIES = ["UAH", "EUR"] as const;
export type TreasuryCurrency = (typeof TREASURY_CURRENCIES)[number];

const currencyField = z.enum(TREASURY_CURRENCIES).default("UAH");
const amountField = z.number().positive().max(MAX_AMOUNT);
const rateField = z.number().positive().max(MAX_AMOUNT);
const optDate = z
  .string()
  .datetime({ offset: true })
  .optional()
  .or(z.string().min(1).optional());

/** Платіжка вхідна — надходження безналу від клієнта. */
export const createBankPaymentIncomingSchema = z.object({
  /** Контрагент-платник (Customer.id). Опційно, але рекомендовано. */
  customerId: z.string().min(1).optional(),
  /** Рахунок L-TEX, на який надійшли кошти (MgrBankAccount.id). */
  bankAccountId: z.string().min(1),
  /** Стаття руху коштів (MgrCashFlowArticle.id). */
  cashFlowArticleId: z.string().min(1).optional(),
  amount: amountField,
  currency: currencyField,
  rateEur: rateField,
  /** IBAN рахунку платника (для звірки з банком). */
  iban: z.string().max(64).optional(),
  purpose: z.string().max(500).optional(),
  comment: z.string().max(2000).optional(),
  paidAt: optDate,
});

/** Платіжка вихідна — оплата постачальнику / вихідний платіж. */
export const createBankPaymentOutgoingSchema = z.object({
  /** Контрагент-отримувач (Customer.id). Опційно. */
  customerId: z.string().min(1).optional(),
  /** Рахунок L-TEX, з якого списано кошти (MgrBankAccount.id). */
  bankAccountId: z.string().min(1),
  /** Стаття руху коштів — обов'язкова для розходу. */
  cashFlowArticleId: z.string().min(1),
  amount: amountField,
  currency: currencyField,
  rateEur: rateField,
  /** IBAN рахунку отримувача. */
  iban: z.string().max(64).optional(),
  purpose: z.string().max(500).optional(),
  comment: z.string().max(2000).optional(),
  paidAt: optDate,
});

/**
 * Переміщення готівки / інкасація. Хоча б один з рахунків має відрізнятись від
 * іншого (інакше рух безглуздий). `null` рахунок = готівкова каса (сентинел
 * `CASH`). Тому передаємо або `fromAccountId`, або лишаємо порожнім (=каса).
 */
export const createCashTransferSchema = z
  .object({
    /** Рахунок-джерело (MgrBankAccount.id); порожньо = готівкова каса. */
    fromAccountId: z.string().min(1).optional(),
    /** Рахунок-призначення (MgrBankAccount.id); порожньо = готівкова каса. */
    toAccountId: z.string().min(1).optional(),
    cashFlowArticleId: z.string().min(1).optional(),
    amount: amountField,
    currency: currencyField,
    rateEur: rateField,
    comment: z.string().max(2000).optional(),
    transferredAt: optDate,
  })
  .refine((v) => (v.fromAccountId ?? null) !== (v.toAccountId ?? null), {
    message: "Рахунок-джерело і рахунок-призначення мають відрізнятись",
    path: ["toAccountId"],
  });

export type CreateBankPaymentIncomingInput = z.infer<
  typeof createBankPaymentIncomingSchema
>;
export type CreateBankPaymentOutgoingInput = z.infer<
  typeof createBankPaymentOutgoingSchema
>;
export type CreateCashTransferInput = z.infer<typeof createCashTransferSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Автозбереження чернетки (draft) казначейських документів — План
// AUTOSAVE_REALTIME_PLAN. Послаблені версії: усі поля опційні (жодних `.refine`),
// щоб чернетка зберігалась «з першого символу». Обираються у POST/PATCH коли
// body містить `draft === true`.
//
// ⚠️ Грошова безпека: draft лише пише рядок зі `status="draft"` — рухи ДДС/боргу
// НЕ зачіпаються (вони лише при «Провести» через `[id]/post`). Тобто autosave тут
// безпечний за визначенням: створення документа НІКОЛИ не проводить рухів.
// ─────────────────────────────────────────────────────────────────────────────

const draftAmount = z.number().nonnegative().max(MAX_AMOUNT).optional();
const draftRate = z.number().nonnegative().max(MAX_AMOUNT).optional();
const draftCurrency = z.enum(TREASURY_CURRENCIES).optional();

export const bankPaymentDraftSchema = z.object({
  draft: z.literal(true),
  customerId: z.string().min(1).nullable().optional(),
  bankAccountId: z.string().min(1).nullable().optional(),
  cashFlowArticleId: z.string().min(1).nullable().optional(),
  amount: draftAmount,
  currency: draftCurrency,
  rateEur: draftRate,
  iban: z.string().max(64).nullable().optional(),
  purpose: z.string().max(500).nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
  paidAt: optDate,
});

export const cashTransferDraftSchema = z.object({
  draft: z.literal(true),
  fromAccountId: z.string().min(1).nullable().optional(),
  toAccountId: z.string().min(1).nullable().optional(),
  cashFlowArticleId: z.string().min(1).nullable().optional(),
  amount: draftAmount,
  currency: draftCurrency,
  rateEur: draftRate,
  comment: z.string().max(2000).nullable().optional(),
  transferredAt: optDate,
});

export type BankPaymentDraftInput = z.infer<typeof bankPaymentDraftSchema>;
export type CashTransferDraftInput = z.infer<typeof cashTransferDraftSchema>;
