import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, getCurrentRateMock } = vi.hoisted(() => {
  // Спільні делегати для `tx` (усередині $transaction) і singleton `prisma`:
  // тепер `createSaleWithItems` теж працює у транзакції (щоб рух боргу був
  // атомарним з документом), тож `sale.create` викликається на `tx`.
  const delegates = {
    sale: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    saleItem: { deleteMany: vi.fn() },
    customer: { findUnique: vi.fn() },
    mgrClient: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    mgrDebtMovement: { upsert: vi.fn(), groupBy: vi.fn() },
  };
  return {
    mockPrisma: {
      ...delegates,
      $transaction: vi.fn(async (cb: (t: typeof delegates) => unknown) =>
        cb(delegates),
      ),
    },
    getCurrentRateMock: vi.fn(),
  };
});

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/exchange-rate", () => ({
  getCurrentRate: getCurrentRateMock,
}));

import {
  buildSaleTotals,
  createSaleWithItems,
  updateSaleWithItems,
} from "./sale-create";

const baseCustomer = { id: "cust1", code1C: "000001", name: "Test" };
const actor = { userId: "mgr-1" };

const baseInput = {
  customerId: "cust1",
  items: [
    {
      productId: "p1",
      lotId: "l1",
      barcode: "B1",
      pricePerKg: 4,
      weight: 25,
      quantity: 1,
      priceEur: 100,
    },
    {
      productId: "p2",
      lotId: null,
      barcode: null,
      pricePerKg: 5,
      weight: 10,
      quantity: 2,
      priceEur: 50,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentRateMock.mockResolvedValue(43);
});

function fakeSale(): unknown {
  return {
    id: "sale1",
    code1C: null,
    docNumber: 1,
    status: "draft",
    totalEur: 150,
    totalUah: 6450,
    exchangeRateEur: 43,
    exchangeRateUsd: 0,
    priceTypeId: null,
    deliveryMethod: null,
    novaPoshtaBranch: null,
    cashOnDelivery: false,
    codAmountUah: null,
    assignedAgentUserId: null,
    onTradeAgent: true,
    expressWaybill: null,
    notes: null,
    customer: { id: "cust1", code1C: "000001", name: "Test" },
    items: [
      {
        productId: "p1",
        lotId: "l1",
        pricePerKg: 4,
        weight: 25,
        quantity: 1,
        priceEur: 100,
        product: { code1C: "0007854" },
        lot: { barcode: "B1" },
      },
    ],
  };
}

describe("buildSaleTotals", () => {
  it("totalEur=sum(priceEur), totalUah=round(total*rate), нормалізує рядки", () => {
    const r = buildSaleTotals(baseInput.items, 43);
    expect(r.totalEur).toBe(150);
    expect(r.totalUah).toBe(Math.round(150 * 43));
    expect(r.itemRows[0]?.lotId).toBe("l1");
    expect(r.itemRows[0]?.barcode).toBe("B1");
    expect(r.itemRows[0]?.pricePerKg).toBe(4);
    expect(r.itemRows[1]?.lotId).toBeNull();
    expect(r.itemRows[1]?.barcode).toBeNull();
    expect(r.itemRows[1]?.quantity).toBe(2);
  });

  it("округлює totalUah до цілих грн", () => {
    const r = buildSaleTotals(
      [
        {
          productId: "p1",
          pricePerKg: 1,
          weight: 1,
          quantity: 1,
          priceEur: 10.4,
        },
      ],
      43.27,
    );
    expect(r.totalUah).toBe(Math.round(10.4 * 43.27));
  });
});

describe("createSaleWithItems", () => {
  it("обчислює totals і використовує курс EUR (input має пріоритет)", async () => {
    mockPrisma.sale.create.mockResolvedValueOnce(fakeSale());
    await createSaleWithItems(
      { ...baseInput, exchangeRateEur: 41.5 },
      baseCustomer,
      actor,
    );
    expect(getCurrentRateMock).not.toHaveBeenCalled();
    const call = mockPrisma.sale.create.mock.calls[0]?.[0] as {
      data: { totalEur: number; totalUah: number; exchangeRateEur: number };
    };
    expect(call.data.totalEur).toBe(150);
    expect(call.data.exchangeRateEur).toBe(41.5);
    expect(call.data.totalUah).toBe(Math.round(150 * 41.5));
  });

  it("fallback на getCurrentRate коли курс не передано", async () => {
    mockPrisma.sale.create.mockResolvedValueOnce(fakeSale());
    await createSaleWithItems(baseInput, baseCustomer, actor);
    expect(getCurrentRateMock).toHaveBeenCalled();
    const call = mockPrisma.sale.create.mock.calls[0]?.[0] as {
      data: { exchangeRateEur: number };
    };
    expect(call.data.exchangeRateEur).toBe(43);
  });

  it("codAmountUah = round(totalUah) коли наложка; null коли ні", async () => {
    mockPrisma.sale.create.mockResolvedValueOnce(fakeSale());
    await createSaleWithItems(
      { ...baseInput, cashOnDelivery: true, exchangeRateEur: 43 },
      baseCustomer,
      actor,
    );
    const withCod = mockPrisma.sale.create.mock.calls[0]?.[0] as {
      data: { codAmountUah: number | null };
    };
    expect(withCod.data.codAmountUah).toBe(Math.round(150 * 43));

    mockPrisma.sale.create.mockResolvedValueOnce(fakeSale());
    await createSaleWithItems(baseInput, baseCustomer, actor);
    const noCod = mockPrisma.sale.create.mock.calls[1]?.[0] as {
      data: { codAmountUah: number | null };
    };
    expect(noCod.data.codAmountUah).toBeNull();
  });

  it("assignedAgentUserId дефолт = null коли не передано", async () => {
    mockPrisma.sale.create.mockResolvedValueOnce(fakeSale());
    await createSaleWithItems(baseInput, baseCustomer, actor);
    const call = mockPrisma.sale.create.mock.calls[0]?.[0] as {
      data: { assignedAgentUserId: string | null };
    };
    expect(call.data.assignedAgentUserId).toBeNull();
  });

  it("зберігає менеджерські поля + lotId/barcode рядків", async () => {
    mockPrisma.sale.create.mockResolvedValueOnce(fakeSale());
    await createSaleWithItems(
      {
        ...baseInput,
        priceTypeId: "pt-retail",
        deliveryMethod: "post",
        novaPoshtaBranch: "7",
        onTradeAgent: false,
        exportTo1C: false,
        expressWaybill: "TTN1",
      },
      baseCustomer,
      actor,
    );
    const call = mockPrisma.sale.create.mock.calls[0]?.[0] as {
      data: {
        priceTypeId: string | null;
        deliveryMethod: string | null;
        novaPoshtaBranch: string | null;
        onTradeAgent: boolean;
        exportTo1C: boolean;
        expressWaybill: string | null;
        items: {
          create: Array<{ lotId: string | null; barcode: string | null }>;
        };
      };
    };
    expect(call.data.priceTypeId).toBe("pt-retail");
    expect(call.data.deliveryMethod).toBe("post");
    expect(call.data.novaPoshtaBranch).toBe("7");
    expect(call.data.onTradeAgent).toBe(false);
    expect(call.data.exportTo1C).toBe(false);
    expect(call.data.expressWaybill).toBe("TTN1");
    expect(call.data.items.create[0]?.lotId).toBe("l1");
    expect(call.data.items.create[1]?.lotId).toBeNull();
  });

  it("без post → status=not_posted, archived=false («Зберегти»)", async () => {
    mockPrisma.sale.create.mockResolvedValueOnce(fakeSale());
    await createSaleWithItems(baseInput, baseCustomer, actor);
    const call = mockPrisma.sale.create.mock.calls[0]?.[0] as {
      data: { status: string; archived: boolean };
    };
    expect(call.data.status).toBe("not_posted");
    expect(call.data.archived).toBe(false);
  });

  it("post=true → status=posted, archived=true", async () => {
    mockPrisma.sale.create.mockResolvedValueOnce(fakeSale());
    await createSaleWithItems(
      { ...baseInput, post: true },
      baseCustomer,
      actor,
    );
    const call = mockPrisma.sale.create.mock.calls[0]?.[0] as {
      data: { status: string; archived: boolean };
    };
    expect(call.data.status).toBe("posted");
    expect(call.data.archived).toBe(true);
  });
});

describe("updateSaleWithItems", () => {
  it("замінює items (deleteMany + update.create) у транзакції + recalcs", async () => {
    mockPrisma.sale.update.mockResolvedValueOnce(fakeSale());
    await updateSaleWithItems("sale1", baseInput, actor);
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(mockPrisma.saleItem.deleteMany).toHaveBeenCalledWith({
      where: { saleId: "sale1" },
    });
    const call = mockPrisma.sale.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { totalEur: number };
    };
    expect(call.where.id).toBe("sale1");
    expect(call.data.totalEur).toBe(150);
  });

  it("застосовує nextStatus коли переданий", async () => {
    mockPrisma.sale.update.mockResolvedValueOnce(fakeSale());
    await updateSaleWithItems("sale1", baseInput, actor, {
      nextStatus: "not_posted",
    });
    const call = mockPrisma.sale.update.mock.calls[0]?.[0] as {
      data: { status?: string };
    };
    expect(call.data.status).toBe("not_posted");
  });

  it("nextStatus=posted → archived=true", async () => {
    mockPrisma.sale.update.mockResolvedValueOnce(fakeSale());
    await updateSaleWithItems("sale1", baseInput, actor, {
      nextStatus: "posted",
    });
    const call = mockPrisma.sale.update.mock.calls[0]?.[0] as {
      data: { status?: string; archived?: boolean };
    };
    expect(call.data.status).toBe("posted");
    expect(call.data.archived).toBe(true);
  });

  it("status undefined коли nextStatus не переданий", async () => {
    mockPrisma.sale.update.mockResolvedValueOnce(fakeSale());
    await updateSaleWithItems("sale1", baseInput, actor);
    const call = mockPrisma.sale.update.mock.calls[0]?.[0] as {
      data: { status?: string };
    };
    expect(call.data.status).toBeUndefined();
  });
});

describe("persist повертає реалізацію", () => {
  it("create повертає створену реалізацію", async () => {
    mockPrisma.sale.create.mockResolvedValueOnce(fakeSale());
    await expect(
      createSaleWithItems(baseInput, baseCustomer, actor),
    ).resolves.toBeDefined();
  });

  it("update повертає оновлену реалізацію", async () => {
    mockPrisma.sale.update.mockResolvedValueOnce(fakeSale());
    await expect(
      updateSaleWithItems("sale1", baseInput, actor),
    ).resolves.toBeDefined();
  });
});
