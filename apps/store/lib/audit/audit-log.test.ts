import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    auditLog: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import { logAuditEvent, queryAuditLog } from "./audit-log";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.auditLog.create.mockResolvedValue(undefined);
  mockPrisma.auditLog.count.mockResolvedValue(0);
  mockPrisma.auditLog.findMany.mockResolvedValue([]);
});

describe("logAuditEvent", () => {
  it("записує базові поля у audit_logs", async () => {
    await logAuditEvent({
      user: { id: "u1", email: "a@b", role: "admin" },
      action: "create",
      resource: "order",
      resourceId: "o1",
      summary: "Створено замовлення",
      dataAfter: { id: "o1", total: 100 },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledOnce();
    const args = mockPrisma.auditLog.create.mock.calls[0]?.[0];
    expect(args.data.userId).toBe("u1");
    expect(args.data.userEmail).toBe("a@b");
    expect(args.data.userRole).toBe("admin");
    expect(args.data.action).toBe("create");
    expect(args.data.resource).toBe("order");
    expect(args.data.resourceId).toBe("o1");
    expect(args.data.summary).toBe("Створено замовлення");
    expect(args.data.isOwnerAction).toBe(false);
  });

  it("позначає isOwnerAction=true коли role=owner", async () => {
    await logAuditEvent({
      user: { id: "u1", email: "o@b", role: "owner" },
      action: "delete",
      resource: "client",
    });
    const args = mockPrisma.auditLog.create.mock.calls[0]?.[0];
    expect(args.data.isOwnerAction).toBe(true);
  });

  it("isOwnerAction=false для admin/manager/etc.", async () => {
    await logAuditEvent({
      user: { id: "u1", email: "a@b", role: "admin" },
      action: "update",
      resource: "order",
    });
    expect(
      mockPrisma.auditLog.create.mock.calls[0]?.[0].data.isOwnerAction,
    ).toBe(false);

    await logAuditEvent({
      user: { id: "u2", email: "m@b", role: "manager" },
      action: "create",
      resource: "order",
    });
    expect(
      mockPrisma.auditLog.create.mock.calls[1]?.[0].data.isOwnerAction,
    ).toBe(false);
  });

  it("витягує IP з cf-connecting-ip", async () => {
    const req = new NextRequest("http://localhost/x", {
      headers: { "cf-connecting-ip": "1.2.3.4", "user-agent": "TestUA" },
    });
    await logAuditEvent({
      user: { id: "u1", email: "a@b", role: "admin" },
      action: "login",
      resource: "auth",
      req,
    });
    const data = mockPrisma.auditLog.create.mock.calls[0]?.[0].data;
    expect(data.ip).toBe("1.2.3.4");
    expect(data.userAgent).toBe("TestUA");
  });

  it("fallback на x-real-ip коли cf-connecting-ip відсутній", async () => {
    const req = new NextRequest("http://localhost/x", {
      headers: { "x-real-ip": "10.0.0.1" },
    });
    await logAuditEvent({
      user: { id: "u1", email: "a@b", role: "admin" },
      action: "login",
      resource: "auth",
      req,
    });
    expect(mockPrisma.auditLog.create.mock.calls[0]?.[0].data.ip).toBe(
      "10.0.0.1",
    );
  });

  it("дозволяє null user для failed_login", async () => {
    await logAuditEvent({
      user: null,
      action: "failed_login",
      resource: "auth",
      summary: "Wrong password",
    });
    const data = mockPrisma.auditLog.create.mock.calls[0]?.[0].data;
    expect(data.userId).toBeNull();
    expect(data.userEmail).toBeNull();
    expect(data.userRole).toBe("anonymous");
  });

  it("не пробрасає помилку Prisma — fire-and-forget", async () => {
    mockPrisma.auditLog.create.mockRejectedValueOnce(new Error("DB down"));
    // НЕ має кинути — інакше тест впаде
    await expect(
      logAuditEvent({
        user: { id: "u1", email: "a@b", role: "admin" },
        action: "create",
        resource: "order",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("queryAuditLog", () => {
  it("базовий запит з пагінацією", async () => {
    mockPrisma.auditLog.count.mockResolvedValueOnce(100);
    mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);
    const res = await queryAuditLog({ page: 2, pageSize: 25 });
    expect(res.total).toBe(100);
    expect(res.page).toBe(2);
    expect(res.pageSize).toBe(25);
    expect(res.totalPages).toBe(4);
    const args = mockPrisma.auditLog.findMany.mock.calls[0]?.[0];
    expect(args.skip).toBe(25);
    expect(args.take).toBe(25);
  });

  it("clamps pageSize у межі 10..200", async () => {
    await queryAuditLog({ pageSize: 5 });
    expect(mockPrisma.auditLog.findMany.mock.calls[0]?.[0].take).toBe(10);

    mockPrisma.auditLog.findMany.mockClear();
    await queryAuditLog({ pageSize: 999 });
    expect(mockPrisma.auditLog.findMany.mock.calls[0]?.[0].take).toBe(200);
  });

  it("ownerOnly=true додає isOwnerAction=true у where", async () => {
    await queryAuditLog({ ownerOnly: true });
    const where = mockPrisma.auditLog.findMany.mock.calls[0]?.[0].where;
    expect(where.isOwnerAction).toBe(true);
  });

  it("date range fromDate/toDate → createdAt: { gte, lte }", async () => {
    const from = new Date("2026-05-01");
    const to = new Date("2026-06-01");
    await queryAuditLog({ fromDate: from, toDate: to });
    const where = mockPrisma.auditLog.findMany.mock.calls[0]?.[0].where;
    expect(where.createdAt).toEqual({ gte: from, lte: to });
  });

  it("search фільтрує по summary", async () => {
    await queryAuditLog({ search: "видалив клієнта" });
    const where = mockPrisma.auditLog.findMany.mock.calls[0]?.[0].where;
    expect(where.summary).toEqual({
      contains: "видалив клієнта",
      mode: "insensitive",
    });
  });

  it("role + action + resource — комбінований фільтр", async () => {
    await queryAuditLog({
      role: "owner",
      action: "delete",
      resource: "client",
    });
    const where = mockPrisma.auditLog.findMany.mock.calls[0]?.[0].where;
    expect(where.userRole).toBe("owner");
    expect(where.action).toBe("delete");
    expect(where.resource).toBe("client");
  });

  it("сортування — createdAt desc", async () => {
    await queryAuditLog({});
    const orderBy = mockPrisma.auditLog.findMany.mock.calls[0]?.[0].orderBy;
    expect(orderBy).toEqual({ createdAt: "desc" });
  });
});
