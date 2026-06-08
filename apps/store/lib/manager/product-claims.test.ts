import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    orderItem: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import {
  getProductClaims,
  getProductClaimsSummaries,
  ACTIVE_CLAIM_STATUSES,
} from "./product-claims";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.findMany.mockResolvedValue([]);
});

describe("getProductClaims", () => {
  it("повертає нулі коли активних замовлень нема", async () => {
    mockPrisma.orderItem.findMany.mockResolvedValueOnce([]);
    const res = await getProductClaims("p1", "u1");
    expect(res).toEqual({
      productId: "p1",
      totalWeight: 0,
      totalQuantity: 0,
      ordersCount: 0,
      managersCount: 0,
      orders: [],
    });
  });

  it("фільтрує тільки active-статуси і archived=false", async () => {
    mockPrisma.orderItem.findMany.mockResolvedValueOnce([]);
    await getProductClaims("p1", "u1");
    const args = mockPrisma.orderItem.findMany.mock.calls[0]?.[0];
    expect(args?.where?.productId).toBe("p1");
    expect(args?.where?.order?.archived).toBe(false);
    expect(args?.where?.order?.status?.in).toEqual([...ACTIVE_CLAIM_STATUSES]);
  });

  it("агрегує weight/quantity по одному замовленню (sum рядків)", async () => {
    mockPrisma.orderItem.findMany.mockResolvedValueOnce([
      {
        weight: 20.5,
        quantity: 1,
        order: {
          id: "o1",
          status: "sent",
          createdAt: new Date("2026-05-01"),
          assignedAgentUserId: "u_agent1",
          customer: { name: "Іван" },
        },
      },
      {
        weight: 15,
        quantity: 1,
        order: {
          id: "o1",
          status: "sent",
          createdAt: new Date("2026-05-01"),
          assignedAgentUserId: "u_agent1",
          customer: { name: "Іван" },
        },
      },
    ]);
    mockPrisma.user.findMany.mockResolvedValueOnce([
      { id: "u_agent1", fullName: "Петро Петров" },
    ]);
    const res = await getProductClaims("p1", "u_other");
    expect(res.totalWeight).toBe(35.5);
    expect(res.totalQuantity).toBe(2);
    expect(res.ordersCount).toBe(1);
    expect(res.orders).toHaveLength(1);
    expect(res.orders[0]?.weight).toBe(35.5);
    expect(res.orders[0]?.quantity).toBe(2);
    expect(res.orders[0]?.agentName).toBe("Петро Петров");
    expect(res.orders[0]?.customerName).toBe("Іван");
  });

  it("позначає isMine коли поточний user === assignedAgentUserId", async () => {
    mockPrisma.orderItem.findMany.mockResolvedValueOnce([
      {
        weight: 10,
        quantity: 1,
        order: {
          id: "o1",
          status: "draft",
          createdAt: new Date("2026-05-01"),
          assignedAgentUserId: "u_me",
          customer: { name: "А" },
        },
      },
      {
        weight: 20,
        quantity: 1,
        order: {
          id: "o2",
          status: "draft",
          createdAt: new Date("2026-05-02"),
          assignedAgentUserId: "u_other",
          customer: { name: "Б" },
        },
      },
    ]);
    mockPrisma.user.findMany.mockResolvedValueOnce([
      { id: "u_me", fullName: "Я" },
      { id: "u_other", fullName: "Інший" },
    ]);
    const res = await getProductClaims("p1", "u_me");
    const o1 = res.orders.find((o) => o.id === "o1");
    const o2 = res.orders.find((o) => o.id === "o2");
    expect(o1?.isMine).toBe(true);
    expect(o2?.isMine).toBe(false);
  });

  it("рахує managersCount по різних agentName-ах (null не враховується)", async () => {
    mockPrisma.orderItem.findMany.mockResolvedValueOnce([
      {
        weight: 1,
        quantity: 1,
        order: {
          id: "o1",
          status: "draft",
          createdAt: new Date(),
          assignedAgentUserId: "u1",
          customer: { name: "А" },
        },
      },
      {
        weight: 1,
        quantity: 1,
        order: {
          id: "o2",
          status: "draft",
          createdAt: new Date(),
          assignedAgentUserId: "u1",
          customer: { name: "Б" },
        },
      },
      {
        weight: 1,
        quantity: 1,
        order: {
          id: "o3",
          status: "draft",
          createdAt: new Date(),
          assignedAgentUserId: "u2",
          customer: { name: "В" },
        },
      },
      {
        weight: 1,
        quantity: 1,
        order: {
          id: "o4",
          status: "draft",
          createdAt: new Date(),
          assignedAgentUserId: null,
          customer: { name: "Г" },
        },
      },
    ]);
    mockPrisma.user.findMany.mockResolvedValueOnce([
      { id: "u1", fullName: "Один" },
      { id: "u2", fullName: "Два" },
    ]);
    const res = await getProductClaims("p1", "u_me");
    expect(res.ordersCount).toBe(4);
    expect(res.managersCount).toBe(2); // null не рахуємо
  });

  it("сортує orders від найновішого", async () => {
    mockPrisma.orderItem.findMany.mockResolvedValueOnce([
      {
        weight: 1,
        quantity: 1,
        order: {
          id: "old",
          status: "sent",
          createdAt: new Date("2026-05-01"),
          assignedAgentUserId: null,
          customer: { name: "А" },
        },
      },
      {
        weight: 1,
        quantity: 1,
        order: {
          id: "new",
          status: "sent",
          createdAt: new Date("2026-05-15"),
          assignedAgentUserId: null,
          customer: { name: "Б" },
        },
      },
    ]);
    const res = await getProductClaims("p1", "u_me");
    expect(res.orders[0]?.id).toBe("new");
    expect(res.orders[1]?.id).toBe("old");
  });

  it("підставляє 'Без клієнта' коли customer.name відсутнє", async () => {
    mockPrisma.orderItem.findMany.mockResolvedValueOnce([
      {
        weight: 1,
        quantity: 1,
        order: {
          id: "o1",
          status: "sent",
          createdAt: new Date(),
          assignedAgentUserId: null,
          customer: null,
        },
      },
    ]);
    const res = await getProductClaims("p1", "u_me");
    expect(res.orders[0]?.customerName).toBe("Без клієнта");
  });
});

describe("getProductClaimsSummaries", () => {
  it("повертає пусту мапу для порожнього вводу без BD-виклику", async () => {
    const res = await getProductClaimsSummaries([]);
    expect(res.size).toBe(0);
    expect(mockPrisma.orderItem.findMany).not.toHaveBeenCalled();
  });

  it("агрегує totalQuantity/totalWeight/ordersCount по productId", async () => {
    mockPrisma.orderItem.findMany.mockResolvedValueOnce([
      { productId: "p1", orderId: "o1", weight: 20, quantity: 1 },
      { productId: "p1", orderId: "o2", weight: 30, quantity: 2 },
      { productId: "p1", orderId: "o1", weight: 5, quantity: 1 }, // той самий o1 — не подвоюємо ordersCount
      { productId: "p2", orderId: "o3", weight: 100, quantity: 5 },
    ]);
    const res = await getProductClaimsSummaries(["p1", "p2"]);
    expect(res.get("p1")).toEqual({
      totalQuantity: 4,
      totalWeight: 55,
      ordersCount: 2,
    });
    expect(res.get("p2")).toEqual({
      totalQuantity: 5,
      totalWeight: 100,
      ordersCount: 1,
    });
  });
});
