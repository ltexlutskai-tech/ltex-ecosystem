import { prisma } from "@ltex/db";

/**
 * Звіт «Прострочені борги по договорам» (1С-вигляд, FIFO-старіння).
 *
 * Рухи дебіторки (`MgrDebtMovement`) мають реальні дати (5.5-Звіт-0).
 * Оплати (від'ємні рухи) гасять найстаріші борги першими (FIFO), що дозволяє
 * визначити вік непогашеної частини боргу й виокремити прострочену
 * (старшу за поріг днів) суму — як у 1С-звіті по старінню дебіторки.
 *
 * TODO (поза v1, окремий follow-up):
 *   - колонка «Борг по наложці» (зв'язка рух → COD-Sale через recorder);
 *   - групування по папках контрагентів (`_ParentIDRRef`).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DebtMovementLite {
  occurredAt: Date;
  amountEur: number;
}

/**
 * FIFO-старіння дебіторки. Оплати (−) гасять найстаріші борги (+) першими.
 * Повертає суму непогашених боргів, старших за thresholdDays.
 * Гарантія: overdue ≤ max(0, загальний борг) (не може перевищити тотал).
 */
export function computeOverdueEur(
  movements: DebtMovementLite[],
  thresholdDays: number,
  now: Date,
): number {
  const sorted = [...movements].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  // Черга невичерпаних дебетів (FIFO: найстаріші — на початку).
  const queue: Array<{ date: Date; remaining: number }> = [];

  for (const m of sorted) {
    if (m.amountEur > 0) {
      queue.push({ date: m.occurredAt, remaining: m.amountEur });
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
    }
    // amountEur === 0 — пропускаємо.
  }

  const cutoff = now.getTime() - thresholdDays * MS_PER_DAY;
  let overdue = 0;
  for (const entry of queue) {
    if (entry.date.getTime() < cutoff) {
      overdue += entry.remaining;
    }
  }

  return Math.max(0, Math.round(overdue * 100) / 100);
}

export interface OverdueDebtRow {
  clientId: string;
  name: string;
  agentName: string | null;
  debtEur: number;
  overdueEur: number;
  daysSinceLastPurchase: number | null;
  isOverdue: boolean;
}

export interface OverdueDebtsReport {
  thresholdDays: number;
  rows: OverdueDebtRow[];
  totalDebtEur: number;
  totalOverdueEur: number;
}

export async function buildOverdueDebtsReport(
  thresholdDays: number,
): Promise<OverdueDebtsReport> {
  const clients = await prisma.mgrClient.findMany({
    where: { debt: { gt: 0 } },
    select: {
      id: true,
      name: true,
      debt: true,
      daysSinceLastPurchase: true,
      agent: { select: { fullName: true } },
    },
  });

  if (clients.length === 0) {
    return { thresholdDays, rows: [], totalDebtEur: 0, totalOverdueEur: 0 };
  }

  const ids = clients.map((c) => c.id);
  const movements = await prisma.mgrDebtMovement.findMany({
    where: { clientId: { in: ids } },
    select: { clientId: true, occurredAt: true, amountEur: true },
    orderBy: { occurredAt: "asc" },
  });

  const byClient = new Map<string, DebtMovementLite[]>();
  for (const m of movements) {
    const list = byClient.get(m.clientId);
    const lite: DebtMovementLite = {
      occurredAt: m.occurredAt,
      amountEur: Number(m.amountEur),
    };
    if (list) {
      list.push(lite);
    } else {
      byClient.set(m.clientId, [lite]);
    }
  }

  const now = new Date();
  const rows: OverdueDebtRow[] = clients.map((c) => {
    const movs = byClient.get(c.id) ?? [];
    const overdueEur = computeOverdueEur(movs, thresholdDays, now);
    return {
      clientId: c.id,
      name: c.name,
      agentName: c.agent?.fullName ?? null,
      debtEur: round2(Number(c.debt)),
      overdueEur,
      daysSinceLastPurchase: c.daysSinceLastPurchase,
      isOverdue: overdueEur > 0,
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
