import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockPrisma,
  getCurrentRateMock,
  enqueueOrderCreateMock,
  recordClientEventSafeMock,
} = vi.hoisted(() => {
  const tx = {
    orderItem: { deleteMany: vi.fn() },
    order: { update: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  };
  return {
    mockPrisma: {
      order: {
        create: vi.fn(),
        update: tx.order.update,
        updateMany: tx.order.updateMany,
      },
      orderItem: tx.orderItem,
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
      _tx: tx,
    },
    getCurrentRateMock: vi.fn(),
    enqueueOrderCreateMock: vi.fn(),
    recordClientEventSafeMock: vi.fn(),
  };
});

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/exchange-rate", () => ({
  getCurrentRate: getCurrentRateMock,
}));
vi.mock("@/lib/sync/enqueue", () => ({
  enqueueOrderCreate: enqueueOrderCreateMock,
}));
vi.mock("@/lib/manager/client-timeline", async () => {
  const actual =
    await vi.importActual<typeof import("./client-timeline")>(
      "./client-timeline",
    );
  return { ...actual, recordClientEventSafe: recordClientEventSafeMock };
});

import {
  buildOrderTotals,
  createOrderWithItems,
  updateOrderWithItems,
} from "./order-create";

const baseCustomer = { id: "cust1", code1C: "000001", name: "Test" };
const actor = { userId: "mgr-1" };

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
    customerId: "cust1",
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

    await createOrderWithItems(baseInput, baseCustomer, actor);

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
      actor,
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
    await createOrderWithItems(baseInput, baseCustomer, actor);

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
    await createOrderWithItems(baseInput, baseCustomer, actor);
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
    const order = await createOrderWithItems(baseInput, baseCustomer, actor);
    expect(order).toBeDefined();
    expect((order as { id: string }).id).toBe("ord1");
  });

  it("пише авто-запис історії клієнта (kind=order) після create", async () => {
    mockPrisma.order.create.mockResolvedValueOnce(fakeOrder());
    await createOrderWithItems(baseInput, baseCustomer, actor);
    expect(recordClientEventSafeMock).toHaveBeenCalledOnce();
    const args = recordClientEventSafeMock.mock.calls[0]?.[0] as {
      kind: string;
      customerId: string;
      authorUserId: string;
    };
    expect(args.kind).toBe("order");
    expect(args.customerId).toBe("cust1");
    expect(args.authorUserId).toBe("mgr-1");
  });

  it("дефолт assignedAgentUserId = поточний менеджер коли не передано", async () => {
    mockPrisma.order.create.mockResolvedValueOnce(fakeOrder());
    await createOrderWithItems(baseInput, baseCustomer, actor);
    const call = mockPrisma.order.create.mock.calls[0]?.[0] as {
      data: { assignedAgentUserId: string };
    };
    expect(call.data.assignedAgentUserId).toBe("mgr-1");
  });

  it("зберігає менеджерські поля коли передані", async () => {
    mockPrisma.order.create.mockResolvedValueOnce(fakeOrder());
    await createOrderWithItems(
      {
        ...baseInput,
        priceTypeId: "pt-retail",
        deliveryMethod: "post",
        cashOnDelivery: true,
        assignedAgentUserId: "mgr-2",
        exportTo1C: false,
      },
      baseCustomer,
      actor,
    );
    const call = mockPrisma.order.create.mock.calls[0]?.[0] as {
      data: {
        priceTypeId: string | null;
        deliveryMethod: string | null;
        cashOnDelivery: boolean;
        assignedAgentUserId: string;
        exportTo1C: boolean;
      };
    };
    expect(call.data.priceTypeId).toBe("pt-retail");
    expect(call.data.deliveryMethod).toBe("post");
    expect(call.data.cashOnDelivery).toBe(true);
    expect(call.data.assignedAgentUserId).toBe("mgr-2");
    expect(call.data.exportTo1C).toBe(false);
  });

  it("дефолти менеджерських полів коли не передані", async () => {
    mockPrisma.order.create.mockResolvedValueOnce(fakeOrder());
    await createOrderWithItems(baseInput, baseCustomer, actor);
    const call = mockPrisma.order.create.mock.calls[0]?.[0] as {
      data: {
        priceTypeId: string | null;
        deliveryMethod: string | null;
        cashOnDelivery: boolean;
        exportTo1C: boolean;
      };
    };
    expect(call.data.priceTypeId).toBeNull();
    expect(call.data.deliveryMethod).toBeNull();
    expect(call.data.cashOnDelivery).toBe(false);
    expect(call.data.exportTo1C).toBe(true);
  });

  it("clearOtherActual=false → НЕ використовує транзакцію, прямий create", async () => {
    mockPrisma.order.create.mockResolvedValueOnce(fakeOrder());
    await createOrderWithItems(baseInput, baseCustomer, actor, {
      clearOtherActual: false,
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.order.create).toHaveBeenCalledOnce();
    expect(mockPrisma._tx.order.updateMany).not.toHaveBeenCalled();
  });

  it("clearOtherActual=true → у транзакції знімає isActual зі старих + create", async () => {
    mockPrisma._tx.order.create.mockResolvedValueOnce(fakeOrder());
    await createOrderWithItems(baseInput, baseCustomer, actor, {
      clearOtherActual: true,
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(mockPrisma._tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        customerId: "cust1",
        isActual: true,
        archived: false,
        closedAt: null,
      },
      data: { isActual: false },
    });
    expect(mockPrisma._tx.order.create).toHaveBeenCalledOnce();
  });
});

describe("buildOrderTotals", () => {
  it("обчислює totalEur=sum(priceEur), totalUah=total*rate, нормалізує items", () => {
    const r = buildOrderTotals(
      [
        {
          productId: "p1",
          lotId: "l1",
          weight: 25.5,
          quantity: 1,
          priceEur: 100,
        },
        { productId: "p2", weight: 10, quantity: 2, priceEur: 50 } as never,
      ],
      43,
    );
    expect(r.totalEur).toBe(150);
    expect(r.totalUah).toBe(150 * 43);
    expect(r.itemRows[0]?.lotId).toBe("l1");
    // lotId undefined → null; quantity передано → 2
    expect(r.itemRows[1]?.lotId).toBeNull();
    expect(r.itemRows[1]?.quantity).toBe(2);
  });
});

describe("updateOrderWithItems", () => {
  function fakeUpdatedOrder(): unknown {
    return {
      id: "ord1",
      code1C: null,
      status: "sent",
      totalEur: 150,
      totalUah: 6450,
      exchangeRate: 43,
      notes: "оновлено",
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

  it("замінює items (deleteMany + update.create) у транзакції + recalcs totals", async () => {
    mockPrisma.order.update.mockResolvedValueOnce(fakeUpdatedOrder());
    await updateOrderWithItems("ord1", baseInput, actor);

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(mockPrisma.orderItem.deleteMany).toHaveBeenCalledWith({
      where: { orderId: "ord1" },
    });
    const call = mockPrisma.order.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { totalEur: number; totalUah: number; exchangeRate: number };
    };
    expect(call.where.id).toBe("ord1");
    expect(call.data.totalEur).toBe(150);
    expect(call.data.totalUah).toBe(150 * 43);
  });

  it("застосовує nextStatus коли переданий", async () => {
    mockPrisma.order.update.mockResolvedValueOnce(fakeUpdatedOrder());
    await updateOrderWithItems("ord1", baseInput, actor, {
      nextStatus: "sent",
    });
    const call = mockPrisma.order.update.mock.calls[0]?.[0] as {
      data: { status?: string };
    };
    expect(call.data.status).toBe("sent");
  });

  it("status undefined коли nextStatus не переданий (статус не чіпаємо)", async () => {
    mockPrisma.order.update.mockResolvedValueOnce(fakeUpdatedOrder());
    await updateOrderWithItems("ord1", baseInput, actor);
    const call = mockPrisma.order.update.mock.calls[0]?.[0] as {
      data: { status?: string };
    };
    expect(call.data.status).toBeUndefined();
  });

  it("викликає enqueueOrderCreate fire-and-forget після update", async () => {
    mockPrisma.order.update.mockResolvedValueOnce(fakeUpdatedOrder());
    await updateOrderWithItems("ord1", baseInput, actor);
    expect(enqueueOrderCreateMock).toHaveBeenCalledOnce();
  });

  it("не падає коли enqueue throws — caller отримує order", async () => {
    mockPrisma.order.update.mockResolvedValueOnce(fakeUpdatedOrder());
    enqueueOrderCreateMock.mockRejectedValueOnce(new Error("queue down"));
    const order = await updateOrderWithItems("ord1", baseInput, actor);
    expect((order as { id: string }).id).toBe("ord1");
  });
});
