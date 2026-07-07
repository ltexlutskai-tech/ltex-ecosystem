import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    order: { findMany: vi.fn() },
    mgrReminder: { findMany: vi.fn(), createMany: vi.fn() },
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import { notifyOrdersClosedBySale } from "./sale-order-close";

const baseOpts = {
  saleId: "sale1",
  saleNumber1C: "L0000000900",
  saleCode1C: null,
  saleDocNumber: 12,
  customerId: "cust1",
  actorUserId: "mgr-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.mgrReminder.findMany.mockResolvedValue([]);
  mockPrisma.mgrReminder.createMany.mockResolvedValue({ count: 1 });
});

describe("notifyOrdersClosedBySale", () => {
  it("нічого не робить коли у клієнта немає активних замовлень", async () => {
    mockPrisma.order.findMany.mockResolvedValueOnce([]);
    await notifyOrdersClosedBySale(baseOpts);
    expect(mockPrisma.mgrReminder.createMany).not.toHaveBeenCalled();
  });

  it("створює нагадування власнику активного замовлення", async () => {
    mockPrisma.order.findMany.mockResolvedValueOnce([
      {
        id: "ord1",
        code1C: null,
        number1C: "L0000000500",
        assignedAgentUserId: "mgr-owner",
        customer: { name: "ТОВ Ромашка" },
      },
    ]);
    await notifyOrdersClosedBySale(baseOpts);
    expect(mockPrisma.mgrReminder.createMany).toHaveBeenCalledOnce();
    const rows = mockPrisma.mgrReminder.createMany.mock.calls[0]?.[0]
      .data as Array<{
      ownerUserId: string;
      source: string;
      orderId: string;
      body: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ownerUserId).toBe("mgr-owner");
    expect(rows[0]?.source).toBe("auto_sale_closed_order");
    expect(rows[0]?.orderId).toBe("ord1");
    expect(rows[0]?.body).toContain("L0000000500");
  });

  it("власник = актор коли у замовлення немає призначеного агента", async () => {
    mockPrisma.order.findMany.mockResolvedValueOnce([
      {
        id: "ord1",
        code1C: null,
        number1C: null,
        assignedAgentUserId: null,
        customer: { name: "Клієнт" },
      },
    ]);
    await notifyOrdersClosedBySale(baseOpts);
    const rows = mockPrisma.mgrReminder.createMany.mock.calls[0]?.[0]
      .data as Array<{
      ownerUserId: string;
    }>;
    expect(rows[0]?.ownerUserId).toBe("mgr-1");
  });

  it("дедуп: не дублює нагадування, якщо на замовленні вже висить незавершене", async () => {
    mockPrisma.order.findMany.mockResolvedValueOnce([
      {
        id: "ord1",
        code1C: null,
        number1C: "L1",
        assignedAgentUserId: "mgr-owner",
        customer: { name: "Клієнт" },
      },
    ]);
    mockPrisma.mgrReminder.findMany.mockResolvedValueOnce([
      { orderId: "ord1" },
    ]);
    await notifyOrdersClosedBySale(baseOpts);
    expect(mockPrisma.mgrReminder.createMany).not.toHaveBeenCalled();
  });

  it("не кидає при помилці БД (best-effort)", async () => {
    mockPrisma.order.findMany.mockRejectedValueOnce(new Error("db down"));
    await expect(notifyOrdersClosedBySale(baseOpts)).resolves.toBeUndefined();
  });
});
