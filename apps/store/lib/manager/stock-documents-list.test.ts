import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Регрес-тест: listStockDocs не має вибирати неіснуючі колонки
 * total_weight/total_quantity для Repacking та Inventory (у них
 * inputWeight/outputWeight/lossWeight та is_closed). Раніше це валило Prisma
 * → серверний виняток при відкритті списку «Перепаковка»/«Інвентаризація».
 */

interface FakeDelegate {
  count: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}

const { prismaMock } = vi.hoisted(() => {
  const empty = () => ({
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
  });
  const prismaMock: Record<
    | "productReturnFromCustomer"
    | "warehouseReturn"
    | "returnToSupplier"
    | "repacking"
    | "writeOff"
    | "stockAdjustment"
    | "inventory"
    | "stockTransfer",
    FakeDelegate
  > = {
    productReturnFromCustomer: empty(),
    warehouseReturn: empty(),
    returnToSupplier: empty(),
    repacking: empty(),
    writeOff: empty(),
    stockAdjustment: empty(),
    inventory: empty(),
    stockTransfer: empty(),
  };
  return { prismaMock };
});

vi.mock("@ltex/db", () => ({ prisma: prismaMock }));

import { listStockDocs } from "./stock-documents-api";

function seed(delegate: FakeDelegate, rows: unknown[]): void {
  delegate.count.mockResolvedValue(rows.length);
  delegate.findMany.mockResolvedValue(rows);
}

function lastSelect(delegate: FakeDelegate): Record<string, unknown> {
  const call = delegate.findMany.mock.calls[0];
  return (call?.[0] as { select: Record<string, unknown> }).select;
}

beforeEach(() => vi.clearAllMocks());

describe("listStockDocs select shape", () => {
  it("selects inputWeight (not totalWeight) for repackings", async () => {
    seed(prismaMock.repacking, [
      {
        id: "r1",
        docNumber: "LT-RPK-202607-0001",
        number1C: null,
        docDate: new Date("2026-07-01"),
        status: "posted",
        inputWeight: 42.5,
      },
    ]);

    const res = await listStockDocs("repackings", {});

    const select = lastSelect(prismaMock.repacking);
    expect(select).not.toHaveProperty("totalWeight");
    expect(select).not.toHaveProperty("totalQuantity");
    expect(select).toHaveProperty("inputWeight", true);
    expect(res.items[0]).toMatchObject({
      totalWeight: 42.5,
      totalQuantity: 0,
    });
  });

  it("omits weight/quantity columns for inventories", async () => {
    seed(prismaMock.inventory, [
      {
        id: "i1",
        docNumber: "LT-INV-202607-0001",
        number1C: null,
        docDate: new Date("2026-07-01"),
        status: "draft",
      },
    ]);

    const res = await listStockDocs("inventories", {});

    const select = lastSelect(prismaMock.inventory);
    expect(select).not.toHaveProperty("totalWeight");
    expect(select).not.toHaveProperty("totalQuantity");
    expect(select).not.toHaveProperty("inputWeight");
    expect(res.items[0]).toMatchObject({ totalWeight: 0, totalQuantity: 0 });
  });

  it("selects totalWeight/totalQuantity for write-offs", async () => {
    seed(prismaMock.writeOff, [
      {
        id: "w1",
        docNumber: "LT-WOF-202607-0001",
        number1C: null,
        docDate: new Date("2026-07-01"),
        status: "posted",
        totalWeight: 10,
        totalQuantity: 3,
      },
    ]);

    await listStockDocs("write-offs", {});

    const select = lastSelect(prismaMock.writeOff);
    expect(select).toHaveProperty("totalWeight", true);
    expect(select).toHaveProperty("totalQuantity", true);
  });
});
