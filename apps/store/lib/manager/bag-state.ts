import { prisma, type PrismaClient } from "@ltex/db";
import { nextDocNumber } from "./stock-documents";
import type {
  CreateBagStateInput,
  UpdateBagStateInput,
  BagStateItemInput,
} from "../validations/bag-state";

/**
 * Документ «Зміна стану мішка» (← 1С ИзменениеСостоянияМешка) — CRUD-шар.
 *
 * Пакетний редактор мішків: шапка (Номер авто / Дата / Коментар) + рядки
 * (кожен = один Lot за barcode). Генератор номера + create/update чернетки.
 * Логіка проведення (запис у лоти + журнал) — у `bag-state-hooks.ts`.
 */

export const BAG_STATE_NUMBER_PREFIX = "BSC";

/** Місячний префікс `LT-BSC-YYYYMM-`. */
export function bagStateNumberPrefix(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `LT-${BAG_STATE_NUMBER_PREFIX}-${yyyy}${mm}-`;
}

/** Наступний вільний `LT-BSC-YYYYMM-NNNN`. */
export async function generateBagStateDocNumber(
  date: Date = new Date(),
  db: PrismaClient = prisma,
): Promise<string> {
  const prefix = bagStateNumberPrefix(date);
  const existing = await db.bagStateChange.findMany({
    where: { docNumber: { startsWith: prefix } },
    select: { docNumber: true },
  });
  return nextDocNumber(
    prefix,
    existing.map((r) => r.docNumber),
  );
}

/** Нормалізує рядок валідованого input → Prisma-create shape (з lineNo). */
function itemCreateRows(items: BagStateItemInput[]) {
  return items.map((it, idx) => ({
    lineNo: idx + 1,
    barcode: it.barcode,
    productId: it.productId ?? null,
    isOpen: it.isOpen ?? false,
    hasVideo: it.hasVideo ?? false,
    isTarget: it.isTarget ?? false,
    onAir: it.onAir ?? false,
    onAirDelivery: it.onAirDelivery ?? false,
    youtubeUrl: it.youtubeUrl ?? null,
    description: it.description ?? null,
    comment: it.comment ?? null,
    reservedAgentUserId: it.reservedAgentUserId ?? null,
    reservedClientId: it.reservedClientId ?? null,
    reservedUntil: it.reservedUntil ? new Date(it.reservedUntil) : null,
    sector: it.sector ?? null,
  }));
}

export interface BagStateActor {
  userId: string;
}

/** Створює чернетку документа + рядки атомарно. */
export async function createBagStateChange(
  input: CreateBagStateInput,
  actor: BagStateActor,
  db: PrismaClient = prisma,
): Promise<{ id: string; docNumber: string }> {
  const docDate = input.docDate ? new Date(input.docDate) : new Date();
  const docNumber = await generateBagStateDocNumber(docDate, db);
  const doc = await db.bagStateChange.create({
    data: {
      docNumber,
      docDate,
      status: "draft",
      notes: input.notes ?? null,
      createdByUserId: actor.userId,
      items: { create: itemCreateRows(input.items) },
    },
    select: { id: true, docNumber: true },
  });
  return doc;
}

/**
 * Оновлює чернетку (шапка + повна заміна рядків). Caller (endpoint) гарантує,
 * що документ у статусі `draft` (проведений — заблокований).
 */
export async function updateBagStateChange(
  id: string,
  input: UpdateBagStateInput,
  db: PrismaClient = prisma,
): Promise<{ id: string; docNumber: string }> {
  return db.$transaction(async (tx) => {
    await tx.bagStateChangeItem.deleteMany({ where: { documentId: id } });
    const doc = await tx.bagStateChange.update({
      where: { id },
      data: {
        ...(input.docDate ? { docDate: new Date(input.docDate) } : {}),
        notes: input.notes ?? null,
        items: { create: itemCreateRows(input.items) },
      },
      select: { id: true, docNumber: true },
    });
    return doc;
  });
}
