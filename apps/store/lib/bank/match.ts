/**
 * ЧИСТИЙ матчинг-двигун воронки авто-рознесення платежів (Крок 3;
 * docs/BANKING_INTEGRATION_ANALYSIS.md §11). Без Prisma/fetch — покрито тестами.
 *
 * Рівні впізнавання вхідної банківської транзакції:
 *  1. Номер документа у призначенні платежу («L0000002477») — сильний сигнал;
 *  2. «Очікування оплати» (менеджер скинув реквізити на суму X клієнту Y):
 *     точний збіг суми до копійки у вікні TTL — сильний сигнал;
 *  3. Памʼять платників (IBAN/ЄДРПОУ платника вже лінкований до клієнта) —
 *     сильний сигнал;
 *  4. Збіг ПІБ/назви — лише підказка (слабкий, сам нічого не проводить).
 *
 * Рішення: ≥2 сильні сигнали ОДНОГО клієнта → авто-проведення; 1 сильний →
 * чернетка на підтвердження; сильні сигнали різних клієнтів (конфлікт) або
 * нічого → дошка «Нерознесені гроші».
 */

export interface MatchTxnInput {
  amount: number; // + прихід
  currencyCode: string;
  occurredAt: Date;
  counterIban: string | null;
  counterEdrpou: string | null;
  counterName: string | null;
  comment: string | null;
  description: string | null;
}

export interface OpenExpectationInput {
  id: string;
  customerId: string;
  saleId: string | null;
  amountUah: number;
  expiresAt: Date;
}

export interface PayerRequisiteInput {
  customerId: string;
  counterIban: string | null;
  counterEdrpou: string | null;
}

/** Реалізація/замовлення, знайдені за номером документа з призначення. */
export interface DocRefInput {
  ref: string; // номер документа (напр. L0000002477)
  customerId: string;
  saleId: string | null;
}

export interface MatchSignal {
  kind: "doc_ref" | "expectation" | "payer_requisite" | "name";
  strong: boolean;
  customerId: string;
  saleId?: string | null;
  expectationId?: string;
  detail: string;
}

export interface MatchDecision {
  action: "auto" | "draft" | "none";
  customerId?: string;
  saleId?: string | null;
  expectationId?: string;
  signals: MatchSignal[];
  note: string;
}

/** Витягує номери документів формату 1С («L» + 6–12 цифр) з текстів. */
export function extractDocRefs(texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.toUpperCase().matchAll(/L\d{6,12}/g)) {
      found.add(m[0]);
    }
  }
  return [...found];
}

/** Слова-форми власності — не несуть інформації для порівняння назв. */
const LEGAL_FORM_WORDS = new Set(["фоп", "тов", "пп", "спд", "фо-п"]);

/**
 * Нормалізація назви для мʼякого порівняння (без ФОП/ТОВ/лапок/регістру).
 * ⚠️ `\b` у JS-regex не працює з кирилицею — тому фільтруємо по словах.
 */
export function normalizePayerName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/["«»'’]/g, "")
    .split(/\s+/)
    .filter((w) => w !== "" && !LEGAL_FORM_WORDS.has(w))
    .join(" ");
}

/** Порівняння сум до копійки (захист від float-шуму). */
function sameAmount(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

export interface CollectSignalsContext {
  expectations: OpenExpectationInput[];
  payerRequisites: PayerRequisiteInput[];
  docRefs: DocRefInput[];
  /** customerId → нормалізована назва клієнта (для слабкого сигналу). */
  namesByCustomer?: Map<string, string>;
}

/** Збирає всі сигнали впізнавання для однієї вхідної транзакції. */
export function collectSignals(
  txn: MatchTxnInput,
  ctx: CollectSignalsContext,
): MatchSignal[] {
  const signals: MatchSignal[] = [];

  // 1. Номер документа у призначенні.
  for (const ref of ctx.docRefs) {
    signals.push({
      kind: "doc_ref",
      strong: true,
      customerId: ref.customerId,
      saleId: ref.saleId,
      detail: `Номер документа ${ref.ref} у призначенні`,
    });
  }

  // 2. Очікування оплати: точна сума у вікні дії.
  for (const exp of ctx.expectations) {
    if (exp.expiresAt.getTime() < txn.occurredAt.getTime()) continue;
    if (!sameAmount(exp.amountUah, txn.amount)) continue;
    signals.push({
      kind: "expectation",
      strong: true,
      customerId: exp.customerId,
      saleId: exp.saleId,
      expectationId: exp.id,
      detail: `Очікування оплати на ${exp.amountUah.toFixed(2)} грн`,
    });
  }

  // 3. Памʼять платників (IBAN → ЄДРПОУ).
  const iban = txn.counterIban?.trim() || null;
  const edrpou = txn.counterEdrpou?.trim() || null;
  for (const pr of ctx.payerRequisites) {
    const ibanHit = iban && pr.counterIban && pr.counterIban === iban;
    const edrpouHit = edrpou && pr.counterEdrpou && pr.counterEdrpou === edrpou;
    if (!ibanHit && !edrpouHit) continue;
    signals.push({
      kind: "payer_requisite",
      strong: true,
      customerId: pr.customerId,
      detail: ibanHit
        ? `Відомий платник (IBAN …${iban.slice(-6)})`
        : `Відомий платник (ЄДРПОУ ${edrpou})`,
    });
  }

  // 4. Збіг назви — лише підказка.
  if (txn.counterName && ctx.namesByCustomer) {
    const payer = normalizePayerName(txn.counterName);
    if (payer) {
      for (const [customerId, name] of ctx.namesByCustomer) {
        if (!name) continue;
        if (payer.includes(name) || name.includes(payer)) {
          signals.push({
            kind: "name",
            strong: false,
            customerId,
            detail: `Схожа назва платника («${txn.counterName}»)`,
          });
        }
      }
    }
  }

  return signals;
}

/**
 * Рішення воронки: ≥2 сильні сигнали одного клієнта → auto; 1 сильний →
 * draft; конфлікт клієнтів між сильними сигналами або нічого → none.
 * Дублікати сигналів одного kind для одного клієнта рахуються один раз.
 */
export function decide(signals: MatchSignal[]): MatchDecision {
  const strong = signals.filter((s) => s.strong);
  const byCustomer = new Map<string, MatchSignal[]>();
  for (const s of strong) {
    const list = byCustomer.get(s.customerId);
    if (list) list.push(s);
    else byCustomer.set(s.customerId, [s]);
  }

  if (byCustomer.size === 0) {
    const hint = signals.find((s) => !s.strong);
    return {
      action: "none",
      signals,
      note: hint
        ? `Немає надійних сигналів. Підказка: ${hint.detail}`
        : "Платника не впізнано",
    };
  }

  if (byCustomer.size > 1) {
    return {
      action: "none",
      signals,
      note: `Конфлікт: сигнали вказують на ${byCustomer.size} різних клієнтів`,
    };
  }

  const entry = [...byCustomer.entries()][0];
  if (!entry) return { action: "none", signals, note: "Платника не впізнано" };
  const [customerId, customerSignals] = entry;
  const kinds = new Set(customerSignals.map((s) => s.kind));
  const saleId = customerSignals.find((s) => s.saleId != null)?.saleId ?? null;
  const expectationId = customerSignals.find(
    (s) => s.expectationId,
  )?.expectationId;
  const detail = customerSignals.map((s) => s.detail).join(" + ");

  if (kinds.size >= 2) {
    return {
      action: "auto",
      customerId,
      saleId,
      expectationId,
      signals,
      note: `Авто: ${detail}`,
    };
  }
  return {
    action: "draft",
    customerId,
    saleId,
    expectationId,
    signals,
    note: `Один сигнал: ${detail}`,
  };
}
