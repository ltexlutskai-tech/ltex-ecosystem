/**
 * Чисті хелпери для глобального переглядача регістру боргу
 * (`/manager/registry/debt`).
 *
 * Винесено окремо для тестування: побудова Prisma `where` із searchParams
 * та маппінг руху боргу → рядок таблиці RegisterViewer.
 *
 * NB: `debt-register.ts` зайнятий recompute-логікою (5.4.5) — тут лише view.
 */

import { Prisma } from "@ltex/db";

/** Допустимі види руху боргу (дзеркалить `MgrDebtMovementKind`). */
export const DEBT_MOVEMENT_KINDS = [
  "opening",
  "sale",
  "payment",
  "correction",
] as const;

export type DebtMovementKind = (typeof DEBT_MOVEMENT_KINDS)[number];

export const DEBT_KIND_LABEL: Record<DebtMovementKind, string> = {
  opening: "Початковий залишок",
  sale: "Реалізація",
  payment: "Оплата",
  correction: "Корекція",
};

export const DEBT_SOURCE_LABEL: Record<string, string> = {
  accum_rg5269: "Імпорт 1С",
  sale: "Реалізація",
  cash_order: "Каса",
  manual: "Вручну",
};

/** Сирий зріз фільтрів зі searchParams. */
export interface DebtFilterInput {
  from?: string;
  to?: string;
  clientId?: string;
  kind?: string;
  q?: string;
}

/** Безпечний парс дати `YYYY-MM-DD` → Date | undefined. */
function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function isDebtKind(value: string): value is DebtMovementKind {
  return (DEBT_MOVEMENT_KINDS as readonly string[]).includes(value);
}

/**
 * Будує Prisma WHERE для `MgrDebtMovement` із вхідних фільтрів.
 * Період — за `occurredAt`; клієнт — за `clientId` (пріоритет) або
 * пошуком `q` по імені клієнта (contains, case-insensitive).
 */
export function buildDebtWhere(
  input: DebtFilterInput,
): Prisma.MgrDebtMovementWhereInput {
  const where: Prisma.MgrDebtMovementWhereInput = {};

  const from = parseDate(input.from);
  const to = parseDate(input.to);
  if (from || to) {
    const occurredAt: Prisma.DateTimeFilter = {};
    if (from) occurredAt.gte = from;
    if (to) {
      // включно по кінець дня `to`
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      occurredAt.lte = end;
    }
    where.occurredAt = occurredAt;
  }

  if (input.clientId) {
    where.clientId = input.clientId;
  } else if (input.q && input.q.trim()) {
    where.client = {
      name: { contains: input.q.trim(), mode: "insensitive" },
    };
  }

  if (input.kind && isDebtKind(input.kind)) {
    where.kind = input.kind;
  }

  return where;
}

/** Сирий рух боргу з Prisma (з підвантаженим клієнтом). */
export interface DebtMovementRaw {
  id: string;
  clientId: string;
  occurredAt: Date;
  amountEur: Prisma.Decimal | number;
  kind: string;
  sourceType: string | null;
  note: string | null;
  client: { id: string; name: string } | null;
}

/** Рядок таблиці для RegisterViewer (серіалізований, без Decimal). */
export interface DebtRegisterRow {
  id: string;
  occurredAt: string;
  clientId: string | null;
  clientName: string;
  amountEur: number;
  kind: string;
  kindLabel: string;
  sourceLabel: string;
  note: string;
}

/** Маппінг руху боргу → рядок таблиці. */
export function mapDebtMovementToRow(m: DebtMovementRaw): DebtRegisterRow {
  const amount =
    typeof m.amountEur === "number" ? m.amountEur : Number(m.amountEur);
  return {
    id: m.id,
    occurredAt: m.occurredAt.toISOString(),
    clientId: m.client?.id ?? null,
    clientName: m.client?.name ?? "—",
    amountEur: amount,
    kind: m.kind,
    kindLabel: isDebtKind(m.kind) ? DEBT_KIND_LABEL[m.kind] : m.kind,
    sourceLabel: m.sourceType
      ? (DEBT_SOURCE_LABEL[m.sourceType] ?? m.sourceType)
      : "—",
    note: m.note ?? "—",
  };
}
