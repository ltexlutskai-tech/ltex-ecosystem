import { prisma } from "@ltex/db";
import type { StockDocKind } from "./stock-documents";
import {
  productReturnSchema,
  warehouseReturnSchema,
  supplierReturnSchema,
  repackingSchema,
  writeOffSchema,
  stockAdjustmentSchema,
  inventorySchema,
  stockTransferSchema,
} from "../validations/stock-documents";
import { normalizeLine, type CreateDocInput } from "./stock-documents-repo";

export const STOCK_DOC_KINDS: readonly StockDocKind[] = [
  "product-returns",
  "warehouse-returns",
  "supplier-returns",
  "repackings",
  "write-offs",
  "stock-adjustments",
  "inventories",
  "stock-transfers",
];

export function isStockDocKind(v: string): v is StockDocKind {
  return (STOCK_DOC_KINDS as readonly string[]).includes(v);
}

/** Парсить тіло на створення документа → CreateDocInput або {issues}. */
export function parseCreateBody(
  kind: StockDocKind,
  body: unknown,
  createdByUserId: string,
): { ok: true; data: CreateDocInput } | { ok: false; issues: unknown[] } {
  const common = (docDate: Date | undefined) => ({
    docDate: docDate ?? new Date(),
    createdByUserId,
  });
  switch (kind) {
    case "product-returns": {
      const p = productReturnSchema.safeParse(body);
      if (!p.success) return { ok: false, issues: p.error.issues.slice(0, 5) };
      return {
        ok: true,
        data: {
          ...common(p.data.docDate),
          warehouseId: p.data.warehouseId,
          notes: p.data.notes,
          customerId: p.data.customerId,
          customerName: p.data.customerName,
          saleId: p.data.saleId,
          exchangeRate: p.data.exchangeRate,
          lines: p.data.items.map(normalizeLine),
        },
      };
    }
    case "warehouse-returns": {
      const p = warehouseReturnSchema.safeParse(body);
      if (!p.success) return { ok: false, issues: p.error.issues.slice(0, 5) };
      return {
        ok: true,
        data: {
          ...common(p.data.docDate),
          warehouseId: p.data.warehouseId,
          notes: p.data.notes,
          lines: p.data.items.map(normalizeLine),
        },
      };
    }
    case "supplier-returns": {
      const p = supplierReturnSchema.safeParse(body);
      if (!p.success) return { ok: false, issues: p.error.issues.slice(0, 5) };
      return {
        ok: true,
        data: {
          ...common(p.data.docDate),
          warehouseId: p.data.warehouseId,
          notes: p.data.notes,
          supplierId: p.data.supplierId,
          supplierName: p.data.supplierName,
          exchangeRate: p.data.exchangeRate,
          lines: p.data.items.map(normalizeLine),
        },
      };
    }
    case "repackings": {
      const p = repackingSchema.safeParse(body);
      if (!p.success) return { ok: false, issues: p.error.issues.slice(0, 5) };
      return {
        ok: true,
        data: {
          ...common(p.data.docDate),
          warehouseId: p.data.warehouseId,
          notes: p.data.notes,
          lines: p.data.items.map((l) =>
            normalizeLine({
              ...l,
              // Для комплектації ЦінаПродажуВес = priceEur рядка (щоб amountEur
              // рахувалась), + окреме поле salePriceEur.
              priceEur:
                l.role === "assembled" && l.salePriceEur != null
                  ? l.salePriceEur
                  : l.priceEur,
              sourceLotId: l.sourceLotId,
              salePriceEur: l.salePriceEur,
              qualityId: l.qualityId,
              sector: l.sector,
              sectorId: l.sectorId,
            }),
          ),
        },
      };
    }
    case "write-offs": {
      const p = writeOffSchema.safeParse(body);
      if (!p.success) return { ok: false, issues: p.error.issues.slice(0, 5) };
      return {
        ok: true,
        data: {
          ...common(p.data.docDate),
          warehouseId: p.data.warehouseId,
          notes: p.data.notes,
          reason: p.data.reason,
          lines: p.data.items.map(normalizeLine),
        },
      };
    }
    case "stock-adjustments": {
      const p = stockAdjustmentSchema.safeParse(body);
      if (!p.success) return { ok: false, issues: p.error.issues.slice(0, 5) };
      return {
        ok: true,
        data: {
          ...common(p.data.docDate),
          warehouseId: p.data.warehouseId,
          notes: p.data.notes,
          reason: p.data.reason,
          lines: p.data.items.map(normalizeLine),
        },
      };
    }
    case "inventories": {
      const p = inventorySchema.safeParse(body);
      if (!p.success) return { ok: false, issues: p.error.issues.slice(0, 5) };
      return {
        ok: true,
        data: {
          ...common(p.data.docDate),
          warehouseId: p.data.warehouseId,
          notes: p.data.notes,
          lines: p.data.items.map((l) =>
            normalizeLine({
              ...l,
              qtyAccounting: l.qtyAccounting,
              qtyActual: l.qtyActual,
            }),
          ),
        },
      };
    }
    case "stock-transfers": {
      const p = stockTransferSchema.safeParse(body);
      if (!p.success) return { ok: false, issues: p.error.issues.slice(0, 5) };
      return {
        ok: true,
        data: {
          ...common(p.data.docDate),
          warehouseId: p.data.warehouseId,
          notes: p.data.notes,
          fromWarehouseId: p.data.fromWarehouseId,
          toWarehouseId: p.data.toWarehouseId,
          lines: p.data.items.map(normalizeLine),
        },
      };
    }
  }
}

export interface ListItem {
  id: string;
  docNumber: string;
  number1C: string | null;
  docDate: Date;
  status: string;
  totalWeight: number;
  totalQuantity: number;
}

export async function listStockDocs(
  kind: StockDocKind,
  opts: { status?: string; q?: string; page?: number; pageSize?: number },
): Promise<{
  items: ListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? 30;
  const q = (opts.q ?? "").trim();
  const where: Record<string, unknown> = {};
  if (opts.status) where.status = opts.status;
  if (q)
    where.OR = [
      { docNumber: { contains: q, mode: "insensitive" } },
      { number1C: { contains: q, mode: "insensitive" } },
    ];
  const orderBy = { docDate: "desc" as const };
  const skip = (page - 1) * pageSize;
  const paged = { where, orderBy, skip, take: pageSize } as const;

  // Спільні колонки заголовка для всіх видів документів.
  const headerSelect = {
    id: true,
    docNumber: true,
    number1C: true,
    docDate: true,
    status: true,
  } as const;

  let total = 0;
  let items: ListItem[] = [];

  // ⚠️ Repacking та Inventory НЕ мають колонок total_weight/total_quantity
  // (у них inputWeight/outputWeight/lossWeight та is_closed відповідно), тому
  // вибірка тих полів валила Prisma. Обробляємо їх окремо, нормалізуючи у
  // спільну форму ListItem, щоб сторінка списку лишалась незмінною.
  if (kind === "repackings") {
    const delegate = prisma.repacking as unknown as CountFindDelegate<{
      id: string;
      docNumber: string;
      number1C: string | null;
      docDate: Date;
      status: string;
      inputWeight: number;
    }>;
    const select = { ...headerSelect, inputWeight: true } as const;
    const [t, rows] = await Promise.all([
      delegate.count({ where }),
      delegate.findMany({ ...paged, select }),
    ]);
    total = t;
    items = rows.map((r) => ({
      id: r.id,
      docNumber: r.docNumber,
      number1C: r.number1C,
      docDate: r.docDate,
      status: r.status,
      totalWeight: r.inputWeight,
      totalQuantity: 0,
    }));
  } else if (kind === "inventories") {
    const delegate = prisma.inventory as unknown as CountFindDelegate<{
      id: string;
      docNumber: string;
      number1C: string | null;
      docDate: Date;
      status: string;
    }>;
    const [t, rows] = await Promise.all([
      delegate.count({ where }),
      delegate.findMany({ ...paged, select: headerSelect }),
    ]);
    total = t;
    items = rows.map((r) => ({ ...r, totalWeight: 0, totalQuantity: 0 }));
  } else {
    const delegate = totalsDelegate(kind);
    const select = {
      ...headerSelect,
      totalWeight: true,
      totalQuantity: true,
    } as const;
    const [t, rows] = await Promise.all([
      delegate.count({ where }),
      delegate.findMany({ ...paged, select }),
    ]);
    total = t;
    items = rows;
  }

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

interface CountFindDelegate<Row> {
  count(args: { where: Record<string, unknown> }): Promise<number>;
  findMany(args: {
    where: Record<string, unknown>;
    orderBy: { docDate: "desc" };
    skip: number;
    take: number;
    select: Record<string, true>;
  }): Promise<Row[]>;
}

/** Делегати видів документів, що мають total_weight/total_quantity. */
function totalsDelegate(kind: StockDocKind): CountFindDelegate<ListItem> {
  const map: Partial<Record<StockDocKind, unknown>> = {
    "product-returns": prisma.productReturnFromCustomer,
    "warehouse-returns": prisma.warehouseReturn,
    "supplier-returns": prisma.returnToSupplier,
    "write-offs": prisma.writeOff,
    "stock-adjustments": prisma.stockAdjustment,
    "stock-transfers": prisma.stockTransfer,
  };
  return map[kind] as CountFindDelegate<ListItem>;
}
