import { prisma } from "@ltex/db";

/**
 * Звіт «Акт звірки взаєморозрахунків» (1С `АктСверкиВзаиморасчетов`).
 *
 * Read-only по `MgrDebtMovement` за період на конкретного клієнта:
 *   • Сальдо на початок  = Σ рухів ДО `from`;
 *   • дебет / кредит     = Σ позитивних / |Σ негативних| рухів У межах [from, to];
 *   • Сальдо на кінець   = сальдо-на-початок + дебет − кредит.
 *
 * Знак рухів (`MgrDebtMovement.amountEur`):
 *   + борг клієнта зростає (реалізація / нарахування) → дебет нашого боку;
 *   − борг зменшується (оплата / повернення)         → кредит.
 *
 * Сальдо у термінах боргу: > 0 → клієнт винен нам; < 0 → переплата клієнта.
 *
 * Чистий хелпер `computeReconciliation` тестується ізольовано; DB-функція
 * `buildReconciliationReport` лише підтягує рухи й делегує розрахунок.
 * Дзеркалить структуру `lib/reports/overdue-debts.ts`.
 */

export interface ReconMovementLite {
  id: string;
  occurredAt: Date;
  amountEur: number;
  kind: string;
  kindLabel: string;
  sourceLabel: string;
  note: string;
}

export interface ReconRow {
  id: string;
  occurredAt: string; // ISO
  kind: string;
  kindLabel: string;
  sourceLabel: string;
  /** Дебет (+ рух): борг клієнта зростає. 0 для кредитових рухів. */
  debitEur: number;
  /** Кредит (− рух, як модуль): борг зменшується. 0 для дебетових рухів. */
  creditEur: number;
  /** Сальдо (наростаюче) ПІСЛЯ цього руху. */
  runningBalanceEur: number;
  note: string;
}

export interface ReconciliationResult {
  openingBalanceEur: number;
  closingBalanceEur: number;
  totalDebitEur: number;
  totalCreditEur: number;
  rows: ReconRow[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Чистий розрахунок акту звірки.
 *
 * @param priorMovements  Рухи ДО початку періоду (для сальдо-на-початок).
 * @param periodMovements Рухи У межах періоду [from, to] (рядки звіту).
 *                        Мають бути відсортовані за occurredAt asc; функція
 *                        додатково сортує оборонно.
 */
export function computeReconciliation(
  priorMovements: ReconMovementLite[],
  periodMovements: ReconMovementLite[],
): ReconciliationResult {
  const openingBalanceEur = round2(
    priorMovements.reduce((sum, m) => sum + m.amountEur, 0),
  );

  const sorted = [...periodMovements].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  let running = openingBalanceEur;
  let totalDebit = 0;
  let totalCredit = 0;

  const rows: ReconRow[] = sorted.map((m) => {
    const debit = m.amountEur > 0 ? m.amountEur : 0;
    const credit = m.amountEur < 0 ? -m.amountEur : 0;
    totalDebit += debit;
    totalCredit += credit;
    running = round2(running + m.amountEur);
    return {
      id: m.id,
      occurredAt: m.occurredAt.toISOString(),
      kind: m.kind,
      kindLabel: m.kindLabel,
      sourceLabel: m.sourceLabel,
      debitEur: round2(debit),
      creditEur: round2(credit),
      runningBalanceEur: running,
      note: m.note,
    };
  });

  const totalDebitEur = round2(totalDebit);
  const totalCreditEur = round2(totalCredit);
  const closingBalanceEur = round2(
    openingBalanceEur + totalDebitEur - totalCreditEur,
  );

  return {
    openingBalanceEur,
    closingBalanceEur,
    totalDebitEur,
    totalCreditEur,
    rows,
  };
}

const KIND_LABEL: Record<string, string> = {
  opening: "Початковий залишок",
  sale: "Реалізація",
  payment: "Оплата",
  correction: "Корекція",
};

const SOURCE_LABEL: Record<string, string> = {
  accum_rg5269: "Імпорт 1С",
  sale: "Реалізація",
  cash_order: "Каса",
  manual: "Вручну",
};

export interface ReconciliationReport extends ReconciliationResult {
  clientId: string;
  clientName: string;
  from: Date | null;
  to: Date | null;
}

/**
 * Підтягує рухи боргу клієнта й будує акт звірки за період [from, to].
 * `from`/`to` — опційні (без них: весь діапазон). `to` включно по кінець дня.
 */
export async function buildReconciliationReport(
  clientId: string,
  from: Date | null,
  to: Date | null,
): Promise<ReconciliationReport | null> {
  const client = await prisma.mgrClient.findUnique({
    where: { id: clientId },
    select: { id: true, name: true },
  });
  if (!client) return null;

  // Кінець дня для `to` (включно).
  const toEnd = to ? new Date(to) : null;
  if (toEnd) toEnd.setHours(23, 59, 59, 999);

  const all = await prisma.mgrDebtMovement.findMany({
    where: { clientId },
    select: {
      id: true,
      occurredAt: true,
      amountEur: true,
      kind: true,
      sourceType: true,
      note: true,
    },
    orderBy: { occurredAt: "asc" },
  });

  const prior: ReconMovementLite[] = [];
  const period: ReconMovementLite[] = [];

  for (const m of all) {
    const lite: ReconMovementLite = {
      id: m.id,
      occurredAt: m.occurredAt,
      amountEur: Number(m.amountEur),
      kind: m.kind,
      kindLabel: KIND_LABEL[m.kind] ?? m.kind,
      sourceLabel: m.sourceType
        ? (SOURCE_LABEL[m.sourceType] ?? m.sourceType)
        : "—",
      note: m.note ?? "—",
    };

    if (from && m.occurredAt.getTime() < from.getTime()) {
      prior.push(lite);
    } else if (toEnd && m.occurredAt.getTime() > toEnd.getTime()) {
      // після періоду — не входить ні в сальдо-на-початок, ні в рядки.
      continue;
    } else {
      period.push(lite);
    }
  }

  const result = computeReconciliation(prior, period);

  return {
    clientId: client.id,
    clientName: client.name,
    from,
    to,
    ...result,
  };
}
