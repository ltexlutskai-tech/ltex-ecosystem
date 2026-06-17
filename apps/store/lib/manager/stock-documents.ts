import { prisma, type PrismaClient } from "@ltex/db";
import { applyDebtMovementSafe } from "./debt-register";

/**
 * ФАЗА 5 — Документи руху товару. Спільна логіка 8 документів:
 *  - генератор номера (`LT-<PREFIX>-YYYYMM-NNNN`);
 *  - конфіг типів (метадані);
 *  - hook проведення → рух боргу для «Повернення від покупця».
 *
 * Проведення ProductReturnFromCustomer пише MgrDebtMovement(amountEur<0) через
 * applyReturnFromCustomerDebt. StockMovement — best-effort (Фаза 2; зараз нема).
 */

export type StockDocKind =
  | "product-returns"
  | "warehouse-returns"
  | "supplier-returns"
  | "repackings"
  | "write-offs"
  | "stock-adjustments"
  | "inventories"
  | "stock-transfers";

export interface StockDocMeta {
  kind: StockDocKind;
  slug: string;
  label: string;
  legacyName: string;
  numberPrefix: string;
  description: string;
}

export const STOCK_DOCS: readonly StockDocMeta[] = [
  { kind: "product-returns", slug: "product-returns", label: "Повернення від покупця", legacyName: "ВозвратОтПокупателя", numberPrefix: "RET", description: "Клієнт повертає товар. Прямо коригує борг (мінус-реалізація)." },
  { kind: "warehouse-returns", slug: "warehouse-returns", label: "Повернення на склад", legacyName: "Возврат", numberPrefix: "WRT", description: "Повернення товару на склад." },
  { kind: "supplier-returns", slug: "supplier-returns", label: "Повернення постачальнику", legacyName: "ВозвратТоваровПоставщику", numberPrefix: "SRT", description: "Повернення товару постачальнику." },
  { kind: "repackings", slug: "repackings", label: "Перепаковка", legacyName: "Перепаковка", numberPrefix: "RPK", description: "Розбір / комплектація мішків з нормою втрат." },
  { kind: "write-offs", slug: "write-offs", label: "Списання товарів", legacyName: "СписаниеТоваров", numberPrefix: "WOF", description: "Списання некондиції / нестачі." },
  { kind: "stock-adjustments", slug: "stock-adjustments", label: "Оприбуткування товарів", legacyName: "ОприходованиеТоваров", numberPrefix: "ADJ", description: "Оприбуткування надлишків на склад." },
  { kind: "inventories", slug: "inventories", label: "Інвентаризація", legacyName: "ИнвентаризацияТоваровНаСкладе", numberPrefix: "INV", description: "Звірка облікових та фактичних залишків." },
  { kind: "stock-transfers", slug: "stock-transfers", label: "Переміщення між складами", legacyName: "ПеремещениеТоваров", numberPrefix: "TRF", description: "Переміщення товару склад-відправник → склад-одержувач." },
] as const;

export function getStockDocMeta(kind: StockDocKind): StockDocMeta {
  const meta = STOCK_DOCS.find((d) => d.kind === kind);
  if (!meta) throw new Error(`Unknown stock doc kind: ${kind}`);
  return meta;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Наступний вільний `LT-<PREFIX>-YYYYMM-NNNN`. Чистий core. */
export function nextDocNumber(prefix: string, existing: readonly string[]): string {
  const re = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);
  let maxSeq = 0;
  for (const n of existing) {
    const m = n.match(re);
    if (m && m[1]) {
      const v = parseInt(m[1], 10);
      if (v > maxSeq) maxSeq = v;
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

/** Будує місячний префікс `LT-<PREFIX>-YYYYMM-`. */
export function docNumberPrefix(kind: StockDocKind, date: Date): string {
  const meta = getStockDocMeta(kind);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `LT-${meta.numberPrefix}-${yyyy}${mm}-`;
}

async function findExistingNumbers(db: PrismaClient, kind: StockDocKind, prefix: string): Promise<string[]> {
  const where = { docNumber: { startsWith: prefix } };
  const select = { docNumber: true } as const;
  switch (kind) {
    case "product-returns": return (await db.productReturnFromCustomer.findMany({ where, select })).map((r) => r.docNumber);
    case "warehouse-returns": return (await db.warehouseReturn.findMany({ where, select })).map((r) => r.docNumber);
    case "supplier-returns": return (await db.returnToSupplier.findMany({ where, select })).map((r) => r.docNumber);
    case "repackings": return (await db.repacking.findMany({ where, select })).map((r) => r.docNumber);
    case "write-offs": return (await db.writeOff.findMany({ where, select })).map((r) => r.docNumber);
    case "stock-adjustments": return (await db.stockAdjustment.findMany({ where, select })).map((r) => r.docNumber);
    case "inventories": return (await db.inventory.findMany({ where, select })).map((r) => r.docNumber);
    case "stock-transfers": return (await db.stockTransfer.findMany({ where, select })).map((r) => r.docNumber);
  }
}

export async function generateStockDocNumber(kind: StockDocKind, date: Date = new Date(), db: PrismaClient = prisma): Promise<string> {
  const prefix = docNumberPrefix(kind, date);
  return nextDocNumber(prefix, await findExistingNumbers(db, kind, prefix));
}

export interface DocLineLike {
  weight: number;
  quantity: number;
  amountEur?: number;
}

/** Σ по рядках: вага, кількість, сума EUR. Чистий. */
export function summarizeLines(lines: readonly DocLineLike[]): { totalWeight: number; totalQuantity: number; totalEur: number } {
  let totalWeight = 0;
  let totalQuantity = 0;
  let totalEur = 0;
  for (const l of lines) {
    totalWeight += l.weight || 0;
    totalQuantity += l.quantity || 0;
    totalEur += l.amountEur || 0;
  }
  return { totalWeight: round2(totalWeight), totalQuantity, totalEur: round2(totalEur) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * При проведенні «Повернення від покупця» пишемо мінус-рух боргу
 * (amountEur<0, kind=correction). Best-effort: НІКОЛИ не валить проведення.
 * TODO (Фаза 2): додати приходний StockMovement (товар повертається на склад).
 */
export function applyReturnFromCustomerDebt(input: {
  returnId: string;
  customerId: string | null;
  totalEur: number;
  occurredAt: Date;
  createdByUserId?: string | null;
}): void {
  if (!input.customerId) return;
  const amount = round2(Math.abs(input.totalEur));
  if (amount <= 0) return;
  applyDebtMovementSafe({
    customerId: input.customerId,
    amountEur: -amount,
    kind: "correction",
    sourceType: "product_return",
    sourceId: input.returnId,
    occurredAt: input.occurredAt,
    note: "Повернення від покупця",
    createdByUserId: input.createdByUserId ?? null,
  });
}

/** Відкат руху боргу повернення (reopen/cancel). Best-effort. TODO (Фаза 2): відкат StockMovement. */
export function revertReturnFromCustomerDebt(returnId: string): void {
  void (async () => {
    const mv = await prisma.mgrDebtMovement.findFirst({
      where: { kind: "correction", sourceType: "product_return", sourceId: returnId },
      select: { id: true, clientId: true },
    });
    if (!mv) return;
    await prisma.mgrDebtMovement.delete({ where: { id: mv.id } });
    const { recomputeDebtForClients } = await import("./debt-register");
    await recomputeDebtForClients(prisma, [mv.clientId]);
  })().catch((e: unknown) => {
    console.warn("[L-TEX] Failed to revert return debt movement", {
      returnId,
      error: e instanceof Error ? e.message : String(e),
    });
  });
}
