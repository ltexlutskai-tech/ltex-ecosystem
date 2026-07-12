import { prisma, type PrismaClient } from "@ltex/db";
import { unitLabel, type LiveItem, type LiveDoc } from "./inventory";

/**
 * Server-authoritative інвентаризація (спільна робота кількох пристроїв).
 *
 * На відміну від «цілий документ у браузері + PATCH-заміна», тут КОЖНА дія —
 * атомарна операція над окремим рядком (мішком), ключ = (inventoryId, barcode).
 * Тому два пристрої (телефон + сканер) можуть сканувати ОДНОЧАСНО: операції
 * ідемпотентні/комутативні на рівні мішка, а клієнти синхронізуються поллінгом.
 *
 * Кожна операція пише запис у `InventoryLog` (журнал документа) — щоб бачити
 * зміни й виправляти, якщо щось пішло не так.
 */

export interface LiveUser {
  id: string;
  fullName: string;
}

export type { LiveItem, LiveDoc };

function itemView(it: {
  id: string;
  lotId: string | null;
  productId: string | null;
  productName: string | null;
  articleCode: string | null;
  barcode: string | null;
  sector: string | null;
  sectorId: string | null;
  weight: number;
  unitName: string | null;
  priceEur: unknown;
  qtyAccounting: number;
  qtyActual: number;
  foundByName: string | null;
  updatedAt: Date;
}): LiveItem {
  return {
    id: it.id,
    lotId: it.lotId,
    productId: it.productId,
    productName: it.productName ?? "",
    articleCode: it.articleCode ?? "",
    barcode: it.barcode ?? "",
    sector: it.sector ?? "",
    sectorId: it.sectorId,
    weight: it.weight,
    unitName: it.unitName ?? "шт",
    priceEur: Number(it.priceEur),
    qtyAccounting: it.qtyAccounting,
    qtyActual: it.qtyActual,
    foundByName: it.foundByName,
    updatedAt: it.updatedAt.toISOString(),
  };
}

const ITEM_SELECT = {
  id: true,
  lotId: true,
  productId: true,
  productName: true,
  articleCode: true,
  barcode: true,
  sector: true,
  sectorId: true,
  weight: true,
  unitName: true,
  priceEur: true,
  qtyAccounting: true,
  qtyActual: true,
  foundByName: true,
  updatedAt: true,
} as const;

/** Best-effort запис у журнал документа (не валить операцію). */
export async function logInventory(
  db: PrismaClient,
  inventoryId: string,
  user: LiveUser | null,
  action: string,
  message: string,
  barcode?: string | null,
): Promise<void> {
  try {
    await db.inventoryLog.create({
      data: {
        inventoryId,
        userId: user?.id ?? null,
        userName: user?.fullName ?? null,
        action,
        message,
        barcode: barcode ?? null,
      },
    });
  } catch (e) {
    console.warn("[L-TEX] inventory log failed", {
      inventoryId,
      action,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Повний знімок документа для синхронізації клієнтів (поллінг). */
export async function getInventoryLive(
  inventoryId: string,
  db: PrismaClient = prisma,
): Promise<LiveDoc | null> {
  const doc = await db.inventory.findUnique({
    where: { id: inventoryId },
    select: {
      id: true,
      docNumber: true,
      number1C: true,
      docDate: true,
      notes: true,
      status: true,
      items: { select: ITEM_SELECT, orderBy: { createdAt: "asc" } },
    },
  });
  if (!doc) return null;
  return {
    id: doc.id,
    docNumber: doc.docNumber,
    number1C: doc.number1C,
    docDate: doc.docDate.toISOString(),
    notes: doc.notes ?? "",
    status: doc.status,
    items: doc.items.map(itemView),
    serverTime: new Date().toISOString(),
  };
}

interface ResolvedLot {
  lotId: string | null;
  productId: string | null;
  productName: string;
  articleCode: string;
  weight: number;
  unitName: string;
  priceEur: number;
  onBooks: boolean;
}

/** Резолвить мішок за ШК (для скану надлишку / знімка). null-lot → невідомий ШК. */
export async function resolveLotByBarcode(
  barcode: string,
  db: PrismaClient = prisma,
): Promise<ResolvedLot> {
  const lot = await db.lot.findUnique({
    where: { barcode },
    select: {
      id: true,
      weight: true,
      priceEur: true,
      status: true,
      sector: true,
      product: {
        select: {
          id: true,
          name: true,
          articleCode: true,
          priceUnit: true,
        },
      },
    },
  });
  if (!lot) {
    return {
      lotId: null,
      productId: null,
      productName: "",
      articleCode: "",
      weight: 0,
      unitName: "шт",
      priceEur: 0,
      onBooks: false,
    };
  }
  return {
    lotId: lot.id,
    productId: lot.product?.id ?? null,
    productName: lot.product?.name ?? "",
    articleCode: lot.product?.articleCode ?? "",
    weight: lot.weight,
    unitName: unitLabel(lot.product?.priceUnit),
    priceEur: lot.priceEur,
    // На складі (не продано/архів) → числиться в обліку.
    onBooks: lot.status !== "sold" && lot.status !== "archived",
  };
}

export interface ScanResult {
  outcome: "found" | "surplus" | "unknown";
  item: LiveItem;
}

/**
 * Скан мішка у документ (server-authoritative). Ключ = (inventoryId, barcode).
 *  • мішок уже в списку → Факт=1 (+сектор, якщо активний);
 *  • нема, але лот існує на складі → рядок надлишку (Облік=0, Факт=1);
 *  • нема і лота нема → «невідомий ШК» рядок надлишку.
 */
export async function scanInventoryBag(
  inventoryId: string,
  barcode: string,
  opts: { sector?: string | null; sectorId?: string | null; user: LiveUser },
  db: PrismaClient = prisma,
): Promise<ScanResult> {
  const code = barcode.trim();
  const now = new Date();
  const sectorPatch =
    opts.sector != null || opts.sectorId != null
      ? { sector: opts.sector ?? null, sectorId: opts.sectorId ?? null }
      : {};

  const existing = await db.inventoryItem.findFirst({
    where: { inventoryId, barcode: code },
    select: { id: true, qtyAccounting: true },
  });

  if (existing) {
    const updated = await db.inventoryItem.update({
      where: { id: existing.id },
      data: {
        qtyActual: 1,
        qtyDifference: 1 - existing.qtyAccounting, // факт − облік
        foundByUserId: opts.user.id,
        foundByName: opts.user.fullName,
        foundAt: now,
        ...sectorPatch,
      },
      select: ITEM_SELECT,
    });
    const view = itemView(updated);
    await logInventory(
      db,
      inventoryId,
      opts.user,
      "found",
      `Знайдено: ${view.productName || code}${
        opts.sector ? ` → сектор ${opts.sector}` : ""
      }`,
      code,
    );
    return { outcome: "found", item: view };
  }

  const resolved = await resolveLotByBarcode(code, db);
  const created = await db.inventoryItem.create({
    data: {
      inventoryId,
      lotId: resolved.lotId,
      productId: resolved.productId,
      productName: resolved.productName || null,
      articleCode: resolved.articleCode || null,
      barcode: code,
      sector: opts.sector ?? null,
      sectorId: opts.sectorId ?? null,
      weight: resolved.weight,
      unitName: resolved.unitName,
      priceEur: resolved.priceEur,
      qtyAccounting: 0,
      qtyActual: 1,
      qtyDifference: 1,
      foundByUserId: opts.user.id,
      foundByName: opts.user.fullName,
      foundAt: now,
    },
    select: ITEM_SELECT,
  });
  const outcome: ScanResult["outcome"] = resolved.lotId ? "surplus" : "unknown";
  await logInventory(
    db,
    inventoryId,
    opts.user,
    outcome,
    outcome === "surplus"
      ? `Надлишок: ${resolved.productName || code}`
      : `Невідомий ШК: ${code}`,
    code,
  );
  return { outcome, item: itemView(created) };
}

/**
 * Заповнення документа мішками зі складу (масово). Ефективно: createMany нових +
 * updateMany наявних (Облік=1). productId — часткове заповнення одним товаром.
 */
export async function fillInventoryFromWarehouse(
  inventoryId: string,
  opts: { productId?: string | null; user: LiveUser },
  db: PrismaClient = prisma,
): Promise<{ added: number; total: number }> {
  const where: Record<string, unknown> = {
    status: { notIn: ["sold", "archived"] },
  };
  if (opts.productId) where.productId = opts.productId;

  const lots = await db.lot.findMany({
    where,
    select: {
      id: true,
      barcode: true,
      weight: true,
      priceEur: true,
      sector: true,
      productId: true,
      product: {
        select: { name: true, articleCode: true, priceUnit: true },
      },
    },
    take: 5001,
  });

  const existing = await db.inventoryItem.findMany({
    where: { inventoryId },
    select: { barcode: true },
  });
  const existingCodes = new Set(
    existing.map((e) => e.barcode).filter((b): b is string => !!b),
  );

  const toCreate = lots.filter((l) => !existingCodes.has(l.barcode));
  const toMarkCodes = lots
    .filter((l) => existingCodes.has(l.barcode))
    .map((l) => l.barcode);

  if (toCreate.length > 0) {
    await db.inventoryItem.createMany({
      data: toCreate.map((l) => ({
        inventoryId,
        lotId: l.id,
        productId: l.productId,
        productName: l.product?.name ?? null,
        articleCode: l.product?.articleCode ?? null,
        barcode: l.barcode,
        sector: l.sector ?? null,
        weight: l.weight,
        unitName: unitLabel(l.product?.priceUnit),
        priceEur: l.priceEur,
        qtyAccounting: 1,
        qtyActual: 0,
        qtyDifference: -1,
      })),
    });
  }
  if (toMarkCodes.length > 0) {
    // Наявні (напр. вже скановані надлишки) → тепер числяться в обліку.
    await db.inventoryItem.updateMany({
      where: { inventoryId, barcode: { in: toMarkCodes }, qtyAccounting: 0 },
      data: { qtyAccounting: 1 },
    });
  }

  const total = await db.inventoryItem.count({ where: { inventoryId } });
  await logInventory(
    db,
    inventoryId,
    opts.user,
    "fill",
    opts.productId
      ? `Додано мішків товару: ${toCreate.length}`
      : `Заповнено зі складу: +${toCreate.length} мішків`,
  );
  return { added: toCreate.length, total };
}

/** Зміна рядка (сектор / факт вручну). */
export async function patchInventoryItem(
  inventoryId: string,
  itemId: string,
  patch: {
    sector?: string | null;
    sectorId?: string | null;
    qtyActual?: number;
  },
  user: LiveUser,
  db: PrismaClient = prisma,
): Promise<LiveItem | null> {
  const item = await db.inventoryItem.findFirst({
    where: { id: itemId, inventoryId },
    select: { id: true, qtyAccounting: true },
  });
  if (!item) return null;
  const data: Record<string, unknown> = {};
  if (patch.sector !== undefined) data.sector = patch.sector;
  if (patch.sectorId !== undefined) data.sectorId = patch.sectorId;
  if (patch.qtyActual !== undefined) {
    data.qtyActual = patch.qtyActual;
    data.qtyDifference = patch.qtyActual - item.qtyAccounting;
    if (patch.qtyActual > 0) {
      data.foundByUserId = user.id;
      data.foundByName = user.fullName;
      data.foundAt = new Date();
    }
  }
  const updated = await db.inventoryItem.update({
    where: { id: item.id },
    data,
    select: ITEM_SELECT,
  });
  const view = itemView(updated);
  const parts: string[] = [];
  if (patch.sector !== undefined) parts.push(`сектор → ${patch.sector || "—"}`);
  if (patch.qtyActual !== undefined)
    parts.push(patch.qtyActual > 0 ? "факт → є" : "факт → нема");
  await logInventory(
    db,
    inventoryId,
    user,
    "edit",
    `${view.productName || view.barcode}: ${parts.join(", ")}`,
    view.barcode,
  );
  return view;
}

/** Видалення рядка. */
export async function deleteInventoryItem(
  inventoryId: string,
  itemId: string,
  user: LiveUser,
  db: PrismaClient = prisma,
): Promise<boolean> {
  const item = await db.inventoryItem.findFirst({
    where: { id: itemId, inventoryId },
    select: { id: true, productName: true, barcode: true },
  });
  if (!item) return false;
  await db.inventoryItem.delete({ where: { id: item.id } });
  await logInventory(
    db,
    inventoryId,
    user,
    "remove",
    `Видалено рядок: ${item.productName || item.barcode || item.id}`,
    item.barcode,
  );
  return true;
}
