import { prisma } from "@ltex/db";
import { formatDocNumber } from "@/lib/manager/order-number";

/**
 * Звіт «Прострочені борги по договорам» (1С-вигляд, по-документна дебіторка).
 *
 * 1С рахує прострочку **по кожному документу реалізації** окремо. Кожна
 * Реалізація — це борг; оплати (від'ємні рухи) гасять найстаріший борг першим
 * (FIFO). Документ прострочений, коли вік його непогашеного залишку перевищує
 * допустиме число днів заборгованості (термін відстрочки клієнта).
 *
 * Поточна реалізація використовує ОДИН ГЛОБАЛЬНИЙ термін (`thresholdDays` з
 * поля «Поріг прострочки, днів», дефолт 14) для всіх клієнтів.
 *
 * TODO Phase 2: per-client ДопустимоеЧислоДнейЗадолженности — імпортувати
 * термін відстрочки кожного контрагента й застосовувати замість глобального.
 *
 * Рухи дебіторки (`MgrDebtMovement`) мають реальні 1С-дати (`occurredAt`).
 * Алгоритм гарантує, що Σ непогашених залишків == max(0, загальний борг), тобто
 * прострочка НЕ МОЖЕ перевищити загальний борг (виправлення старого FIFO, який
 * відкидав ранні кредити при порожній черзі).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DebtMovementLite {
  occurredAt: Date;
  amountEur: number;
  /** hex документа-реєстратора (recorder) для зв'язки з Реалізацією. */
  recorderHex?: string | null;
}

/** Відкритий (непогашений) залишок одного документа-боргу. */
export interface OpenDebtEntry {
  date: Date;
  recorderHex: string | null;
  /** Непогашений залишок документа, €. */
  remaining: number;
  /** Вік документа у днях (floor). */
  days: number;
  /** На скільки днів прострочено (max(0, days − termDays)). */
  daysOverdue: number;
}

export interface OverdueComputation {
  /** Усі відкриті документи з непогашеним залишком > 0 (за датою asc). */
  open: OpenDebtEntry[];
  /** Σ непогашених залишків (== max(0, Σ рухів)). */
  totalOpenEur: number;
  /** Σ залишків прострочених документів (days > termDays). */
  overdueEur: number;
  /** Максимальний вік серед відкритих документів (0 якщо немає). */
  oldestOpenDays: number;
}

/**
 * По-документний FIFO з перенесенням надлишкового кредиту (carry-forward).
 *
 *   - дебет (amount > 0): спершу гаситься накопиченим `carryCredit`
 *     (передоплата), решта (> 0) стає новим відкритим документом;
 *   - кредит (amount < 0): гасить чергу з голови (найстаріші першими); будь-який
 *     залишок кредиту додається у `carryCredit` (передоплата на МАЙБУТНІ дебети);
 *   - amount == 0: пропускається.
 *
 * Гарантія: Σ queue.remaining == max(0, Σ amount) — overdue ≤ загальний борг.
 */
export function computeOverdue(
  movements: DebtMovementLite[],
  termDays: number,
  now: Date,
): OverdueComputation {
  const sorted = [...movements].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  const queue: Array<{
    date: Date;
    recorderHex: string | null;
    remaining: number;
  }> = [];
  let carryCredit = 0;

  for (const m of sorted) {
    if (m.amountEur > 0) {
      let amount = m.amountEur;
      // Спершу абсорбуємо накопичену передоплату.
      if (carryCredit > 0) {
        const applied = Math.min(carryCredit, amount);
        carryCredit -= applied;
        amount -= applied;
      }
      if (amount > 0) {
        queue.push({
          date: m.occurredAt,
          recorderHex: m.recorderHex ?? null,
          remaining: amount,
        });
      }
    } else if (m.amountEur < 0) {
      let credit = -m.amountEur;
      let head = queue[0];
      while (credit > 0 && head !== undefined) {
        if (head.remaining <= credit) {
          credit -= head.remaining;
          queue.shift();
        } else {
          head.remaining -= credit;
          credit = 0;
        }
        head = queue[0];
      }
      // Залишок кредиту — передоплата на майбутні дебети.
      if (credit > 0) {
        carryCredit += credit;
      }
    }
    // amount === 0 — пропускаємо.
  }

  const open: OpenDebtEntry[] = queue.map((entry) => {
    const days = Math.floor(
      (now.getTime() - entry.date.getTime()) / MS_PER_DAY,
    );
    const daysOverdue = Math.max(0, days - termDays);
    return {
      date: entry.date,
      recorderHex: entry.recorderHex,
      remaining: round2(entry.remaining),
      days,
      daysOverdue,
    };
  });

  const totalOpenEur = round2(queue.reduce((sum, e) => sum + e.remaining, 0));
  const overdueEur = round2(
    open.reduce((sum, e) => (e.daysOverdue > 0 ? sum + e.remaining : sum), 0),
  );
  const oldestOpenDays = open.reduce((max, e) => Math.max(max, e.days), 0);

  return { open, totalOpenEur, overdueEur, oldestOpenDays };
}

/**
 * Зворотна сумісність: лише сума прострочених залишків.
 * Гарантія: overdue ≤ max(0, загальний борг).
 */
export function computeOverdueEur(
  movements: DebtMovementLite[],
  thresholdDays: number,
  now: Date,
): number {
  return computeOverdue(movements, thresholdDays, now).overdueEur;
}

export interface OverdueDoc {
  /** hex документа-реєстратора. */
  recorderHex: string | null;
  /** Лейбл накладної (1С-номер / №docNumber / скорочений hex). */
  label: string;
  /** `Sale.id` для лінку (null, якщо документ не зрезолвлено). */
  saleId: string | null;
  /** Дата документа. */
  date: Date;
  /** Повна сума документа (Sale.totalEur), якщо зрезолвлено. */
  docTotalEur: number | null;
  /** Непогашений залишок по документу, €. */
  remaining: number;
  /** Вік документа у днях. */
  days: number;
  /** На скільки днів прострочено. */
  daysOverdue: number;
}

export interface OverdueDebtRow {
  clientId: string;
  name: string;
  agentName: string | null;
  debtEur: number;
  overdueEur: number;
  /** Макс. днів прострочки серед прострочених документів (0, якщо немає). */
  oldestOverdueDays: number;
  /** Індивідуальна відстрочка клієнта (наше поле); null = за замовчуванням. */
  individualTermDays: number | null;
  /** Застосований термін (individualTermDays ?? thresholdDays). */
  effectiveTermDays: number;
  isOverdue: boolean;
  /** "" | "Організувати проплату!" | "Претензійна робота!" */
  activity: string;
  docs: OverdueDoc[];
}

export interface OverdueDebtsReport {
  thresholdDays: number;
  rows: OverdueDebtRow[];
  totalDebtEur: number;
  totalOverdueEur: number;
}

// TODO: точний поріг лейблів уточнити з 1С (30 — припущення).
const CLAIM_WORK_DAYS = 30;

/** Лейбл «Діяльність» за віком найстаршої прострочки. */
function activityLabel(isOverdue: boolean, oldestOverdueDays: number): string {
  if (!isOverdue) return "";
  return oldestOverdueDays <= CLAIM_WORK_DAYS
    ? "Організувати проплату!"
    : "Претензійна робота!";
}

export async function buildOverdueDebtsReport(
  thresholdDays: number,
): Promise<OverdueDebtsReport> {
  // Покупці = клієнти, що з'являються у SalesMovement (виключає постачальників).
  const buyerRows = await prisma.salesMovement.findMany({
    where: { clientId: { not: null } },
    select: { clientId: true },
    distinct: ["clientId"],
  });
  const buyerIds = new Set<string>();
  for (const b of buyerRows) {
    if (b.clientId) buyerIds.add(b.clientId);
  }

  const clients = await prisma.mgrClient.findMany({
    where: { debt: { gt: 0 } },
    select: {
      id: true,
      name: true,
      debt: true,
      debtTermDays: true,
      agent: { select: { fullName: true } },
    },
  });

  const debtorClients = clients.filter((c) => buyerIds.has(c.id));

  if (debtorClients.length === 0) {
    return { thresholdDays, rows: [], totalDebtEur: 0, totalOverdueEur: 0 };
  }

  const ids = debtorClients.map((c) => c.id);
  const movements = await prisma.mgrDebtMovement.findMany({
    where: { clientId: { in: ids } },
    select: {
      clientId: true,
      occurredAt: true,
      amountEur: true,
      sourceId: true,
    },
    orderBy: { occurredAt: "asc" },
  });

  // Групуємо рухи по клієнту + збираємо множину recorder-hex.
  const byClient = new Map<string, DebtMovementLite[]>();
  const recorderHexes = new Set<string>();
  for (const m of movements) {
    const recorderHex = m.sourceId ? m.sourceId.split(":")[0] || null : null;
    if (recorderHex) recorderHexes.add(recorderHex);
    const lite: DebtMovementLite = {
      occurredAt: m.occurredAt,
      amountEur: Number(m.amountEur),
      recorderHex,
    };
    const list = byClient.get(m.clientId);
    if (list) list.push(lite);
    else byClient.set(m.clientId, [lite]);
  }

  // Резолвимо recorder-hex → Sale (за code1C).
  const sales =
    recorderHexes.size > 0
      ? await prisma.sale.findMany({
          where: { code1C: { in: [...recorderHexes] } },
          select: {
            id: true,
            code1C: true,
            number1C: true,
            docNumber: true,
            totalEur: true,
          },
        })
      : [];
  const saleByHex = new Map<
    string,
    {
      id: string;
      number1C: string | null;
      docNumber: number | null;
      totalEur: number;
      code1C: string | null;
    }
  >();
  for (const s of sales) {
    if (s.code1C) {
      saleByHex.set(s.code1C, {
        id: s.id,
        number1C: s.number1C,
        docNumber: s.docNumber,
        totalEur: Number(s.totalEur),
        code1C: s.code1C,
      });
    }
  }

  const now = new Date();
  const rows: OverdueDebtRow[] = debtorClients.map((c) => {
    const movs = byClient.get(c.id) ?? [];
    // Ефективний термін: індивідуальна відстрочка клієнта (наше поле), або
    // глобальний дефолт зі звіту, якщо індивідуальна не задана.
    const termDays = c.debtTermDays ?? thresholdDays;
    const computation = computeOverdue(movs, termDays, now);

    const docs: OverdueDoc[] = computation.open.map((entry) => {
      const sale = entry.recorderHex
        ? saleByHex.get(entry.recorderHex)
        : undefined;
      const label = sale
        ? formatDocNumber({
            number1C: sale.number1C,
            code1C: sale.code1C,
            docNumber: sale.docNumber,
          })
        : entry.recorderHex
          ? `…${entry.recorderHex.slice(-6)}`
          : "—";
      return {
        recorderHex: entry.recorderHex,
        label,
        saleId: sale?.id ?? null,
        date: entry.date,
        docTotalEur: sale ? round2(sale.totalEur) : null,
        remaining: entry.remaining,
        days: entry.days,
        daysOverdue: entry.daysOverdue,
      };
    });

    const oldestOverdueDays = docs.reduce(
      (max, d) => (d.daysOverdue > 0 ? Math.max(max, d.daysOverdue) : max),
      0,
    );
    const isOverdue = computation.overdueEur > 0;

    return {
      clientId: c.id,
      name: c.name,
      agentName: c.agent?.fullName ?? null,
      debtEur: round2(Number(c.debt)),
      overdueEur: computation.overdueEur,
      oldestOverdueDays,
      individualTermDays: c.debtTermDays,
      effectiveTermDays: termDays,
      isOverdue,
      activity: activityLabel(isOverdue, oldestOverdueDays),
      docs,
    };
  });

  rows.sort((a, b) => b.debtEur - a.debtEur);

  const totalDebtEur = round2(rows.reduce((sum, r) => sum + r.debtEur, 0));
  const totalOverdueEur = round2(
    rows.reduce((sum, r) => sum + r.overdueEur, 0),
  );

  return { thresholdDays, rows, totalDebtEur, totalOverdueEur };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
