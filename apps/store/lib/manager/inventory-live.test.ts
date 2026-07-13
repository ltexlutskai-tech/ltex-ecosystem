import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@ltex/db";
import {
  scanInventoryBag,
  fillInventoryFromWarehouse,
  patchInventoryItem,
  deleteInventoryItem,
} from "./inventory-live";

const USER = { id: "u1", fullName: "Тарас" };

function fakeItem(over: Record<string, unknown> = {}) {
  return {
    id: "it1",
    lotId: null,
    productId: null,
    productName: "Товар",
    articleCode: "ART",
    barcode: "111",
    sector: null,
    sectorId: null,
    weight: 10,
    unitName: "кг",
    priceEur: 5,
    qtyAccounting: 1,
    qtyActual: 1,
    foundByName: "Тарас",
    updatedAt: new Date("2026-07-12T10:00:00Z"),
    ...over,
  };
}

/** Мінімальний фейковий Prisma для перевірки, що дії пишуть журнал. */
function fakeDb(over: Record<string, unknown> = {}) {
  const logCreate = vi.fn().mockResolvedValue({});
  const db = {
    inventoryLog: { create: logCreate },
    inventoryItem: {
      findFirst: vi.fn().mockResolvedValue({ id: "it1", qtyAccounting: 1 }),
      update: vi.fn().mockResolvedValue(fakeItem()),
      create: vi.fn().mockResolvedValue(fakeItem({ qtyAccounting: 0 })),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(2),
    },
    lot: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([
        {
          id: "L1",
          barcode: "111",
          weight: 10,
          priceEur: 5,
          sector: null,
          productId: "P1",
          product: { name: "Товар", articleCode: "ART", priceUnit: "kg" },
        },
        {
          id: "L2",
          barcode: "222",
          weight: 8,
          priceEur: 4,
          sector: "A",
          productId: "P2",
          product: { name: "Товар2", articleCode: "ART2", priceUnit: "kg" },
        },
      ]),
    },
    ...over,
  };
  return { db: db as unknown as PrismaClient, logCreate };
}

describe("inventory-live — журнал пишеться на кожну дію", () => {
  it("скан наявного мішка → лог 'found'", async () => {
    const { db, logCreate } = fakeDb();
    const r = await scanInventoryBag("inv1", "111", { user: USER }, db);
    expect(r.outcome).toBe("found");
    expect(logCreate).toHaveBeenCalledTimes(1);
    expect(logCreate.mock.calls[0]![0].data.action).toBe("found");
  });

  it("скан невідомого ШК → новий рядок + лог 'unknown'", async () => {
    const { db, logCreate } = fakeDb({
      inventoryItem: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(fakeItem({ qtyAccounting: 0 })),
      },
    });
    const r = await scanInventoryBag("inv1", "999", { user: USER }, db);
    expect(r.outcome).toBe("unknown");
    expect(logCreate.mock.calls[0]![0].data.action).toBe("unknown");
  });

  it("заповнення зі складу → лог 'fill'", async () => {
    const { db, logCreate } = fakeDb();
    const r = await fillInventoryFromWarehouse("inv1", { user: USER }, db);
    expect(r.added).toBe(2);
    expect(logCreate.mock.calls[0]![0].data.action).toBe("fill");
  });

  it("зміна рядка → лог 'edit'", async () => {
    const { db, logCreate } = fakeDb();
    await patchInventoryItem("inv1", "it1", { qtyActual: 1 }, USER, db);
    expect(logCreate.mock.calls[0]![0].data.action).toBe("edit");
  });

  it("видалення рядка → лог 'remove'", async () => {
    const { db, logCreate } = fakeDb({
      inventoryItem: {
        findFirst: vi.fn().mockResolvedValue({
          id: "it1",
          productName: "Товар",
          barcode: "111",
        }),
        delete: vi.fn().mockResolvedValue({}),
      },
    });
    const ok = await deleteInventoryItem("inv1", "it1", USER, db);
    expect(ok).toBe(true);
    expect(logCreate.mock.calls[0]![0].data.action).toBe("remove");
  });
});
