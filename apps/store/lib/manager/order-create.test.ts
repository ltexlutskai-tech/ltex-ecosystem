import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, getCurrentRateMock, enqueueOrderCreateMock } = vi.hoisted(
  () => ({
    mockPrisma: {
      order: { create: vi.fn() },
    },
    getCurrentRateMock: vi.fn(),
    enqueueOrderCreateMock: vi.fn(),
  }),
);

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/exchange-rate", () => ({
  getCurrentRate: getCurrentRateMock,
}));
vi.mock("@/lib/sync/enqueue", () => ({
  enqueueOrderCreate: enqueueOrderCreateMock,
}));

import { createOrderWithItems } from "./order-create";

const baseCustomer = { id: "cust1", code1C: "000001", name: "Test" };

const baseInput = {
  customerId: "cust1",
  items: [
    { productId: "p1", lotId: "l1", weight: 25.5, quantity: 1, priceEur: 100 },
    { productId: "p2", lotId: null, weight: 10, quantity: 2, priceEur: 50 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentRateMock.mockResolvedValue(43);
  enqueueOrderCreateMock.mockResolvedValue({ id: "j1" });
});

function fakeOrder(): unknown {
  return {
    id: "ord1",
    code1C: null,
    status: "draft",
    totalEur: 150,
    totalUah: 6450,
    exchangeRate: 43,
    notes: null,
    customer: { id: "cust1", code1C: "000001", name: "Test" },
    items: [
      {
        productId: "p1",
        lotId: "l1",
        priceEur: 100,
        weight: 25.5,
        quantity: 1,
        product: { code1C: "C1" },
        lot: { barcode: "B1" },
      },
      {
        productId: "p2",
        lotId: null,
        priceEur: 50,
        weight: 10,
        quantity: 2,
        product: { code1C: "C2" },
        lot: null,
      },
    ],
  };
}

describe("createOrderWithItems", () => {
  it("обчислює totalEur як sum(items.priceEur) і totalUah = totalEur*rate", async () => {
    mockPrisma.order.create.mockResolvedValueOnce(fakeOrder());

    await createOrderWithItems(baseInput, baseCustomer);

    const call = mockPrisma.order.create.mock.calls[0]?.[0] as {
      data: { totalEur: number; totalUah: number; exchangeRate: number };
    };
    expect(call.data.totalEur).toBe(150);
    expect(call.data.totalUah).toBe(150 * 43);
    expect(call.data.exchangeRate).toBe(43);
  });

  it("використовує input.exchangeRate коли передано (skip getCurrentRate)", async () => {
    mockPrisma.order.create.mockResolvedValueOnce(fakeOrder());

    await createOrderWithItems(
      { ...baseInput, exchangeRate: 41.5 },
      baseCustomer,
    );

    expect(getCurrentRateMock).not.toHaveBeenCalled();
    const call = mockPrisma.order.create.mock.calls[0]?.[0] as {
      data: { exchangeRate: number; totalUah: number };
    };
    expect(call.data.exchangeRate).toBe(41.5);
    expect(call.data.totalUah).toBe(150 * 41.5);
  });

  it("створює items з lotId null для general позицій", async () => {
    mockPrisma.order.create.mockResolvedValueOnce(fakeOrder());
    await createOrderWithItems(baseInput, baseCustomer);

    const call = mockPrisma.order.create.mock.calls[0]?.[0] as {
      data: {
        items: { create: Array<{ lotId: string | null }> };
      };
    };
    expect(call.data.items.create[0]?.lotId).toBe("l1");
    expect(call.data.items.create[1]?.lotId).toBeNull();
  });

  it("calls enqueueOrderCreate fire-and-forget після create", async () => {
    mockPrisma.order.create.mockResolvedValueOnce(fakeOrder());
    await createOrderWithItems(baseInput, baseCustomer);
    expect(enqueueOrderCreateMock).toHaveBeenCalledOnce();
    const args = enqueueOrderCreateMock.mock.calls[0]?.[0] as {
      id: string;
      customer: { code1C: string };
    };
    expect(args.id).toBe("ord1");
    expect(args.customer.code1C).toBe("000001");
  });

  it("не падає коли enqueue throws — caller все одно отримує order", async () => {
    mockPrisma.order.create.mockResolvedValueOnce(fakeOrder());
    enqueueOrderCreateMock.mockRejectedValueOnce(new Error("queue down"));
    const order = await createOrderWithItems(baseInput, baseCustomer);
    expect(order).toBeDefined();
    expect((order as { id: string }).id).toBe("ord1");
  });
});
