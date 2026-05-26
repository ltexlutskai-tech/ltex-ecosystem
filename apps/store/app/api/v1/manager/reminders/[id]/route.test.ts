import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrReminder: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    mgrReminderItem: { update: vi.fn(), updateMany: vi.fn() },
    product: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma, Prisma: {} }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
}));

import { PATCH, DELETE } from "./route";

const MANAGER = {
  id: "u1",
  email: "a@b.c",
  fullName: "Alice",
  role: "manager" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};
const ADMIN = { ...MANAGER, id: "admin1", role: "admin" as const };

function fakeUpdated(): unknown {
  return {
    id: "r1",
    body: "x",
    remindAt: new Date("2026-05-20T08:00:00Z"),
    completedAt: null,
    snoozedUntilAt: null,
    periodicity: "none",
    isProductReminder: false,
    orderVideo: false,
    actionType: "none",
    source: "manual",
    lotId: null,
    productId: null,
    clientId: null,
    createdAt: new Date("2026-05-10T08:00:00Z"),
    client: null,
    owner: { id: "u1", fullName: "Alice" },
    items: [],
  };
}

function patchReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/reminders/r1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function delReq(): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/reminders/r1", {
    method: "DELETE",
  });
}
const params = Promise.resolve({ id: "r1" });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
  mockPrisma.product.findMany.mockResolvedValue([]);
  mockPrisma.mgrReminder.findUniqueOrThrow.mockResolvedValue(fakeUpdated());
  // $transaction приймає масив проміс-операцій або callback — для тестів просто
  // повертаємо resolved (ефект перевіряємо за викликами update/updateMany).
  mockPrisma.$transaction.mockImplementation(async (ops: unknown) => {
    if (Array.isArray(ops)) return Promise.all(ops);
    return ops;
  });
});

describe("PATCH /api/v1/manager/reminders/[id]", () => {
  it("404 when reminder missing", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce(null);
    const res = await PATCH(patchReq({ action: "complete" }), { params });
    expect(res.status).toBe(404);
  });

  it("403 when manager is not owner", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce({
      id: "r1",
      ownerUserId: "other",
      remindAt: new Date(),
      periodicity: "none",
    });
    const res = await PATCH(patchReq({ action: "complete" }), { params });
    expect(res.status).toBe(403);
    expect(mockPrisma.mgrReminder.update).not.toHaveBeenCalled();
  });

  it("complete on one-time sets completedAt", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce({
      id: "r1",
      ownerUserId: "u1",
      remindAt: new Date("2026-05-20T08:00:00Z"),
      periodicity: "none",
    });
    mockPrisma.mgrReminder.update.mockResolvedValueOnce(fakeUpdated());
    const res = await PATCH(patchReq({ action: "complete" }), { params });
    expect(res.status).toBe(200);
    const args = mockPrisma.mgrReminder.update.mock.calls[0]?.[0] as {
      data: { completedAt?: Date | null; remindAt?: Date };
    };
    expect(args.data.completedAt).toBeInstanceOf(Date);
    expect(args.data.remindAt).toBeUndefined();
  });

  it("complete on recurring advances remindAt and stays active", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce({
      id: "r1",
      ownerUserId: "u1",
      remindAt: new Date(2026, 4, 20, 8, 0),
      periodicity: "daily",
    });
    mockPrisma.mgrReminder.update.mockResolvedValueOnce(fakeUpdated());
    const res = await PATCH(patchReq({ action: "complete" }), { params });
    expect(res.status).toBe(200);
    const args = mockPrisma.mgrReminder.update.mock.calls[0]?.[0] as {
      data: { completedAt?: Date | null; remindAt?: Date };
    };
    expect(args.data.completedAt).toBeNull();
    expect(args.data.remindAt?.getDate()).toBe(21);
  });

  it("snooze sets snoozedUntilAt", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce({
      id: "r1",
      ownerUserId: "u1",
      remindAt: new Date(),
      periodicity: "none",
    });
    mockPrisma.mgrReminder.update.mockResolvedValueOnce(fakeUpdated());
    const res = await PATCH(
      patchReq({ action: "snooze", snoozedUntil: "2026-05-21T09:00:00Z" }),
      { params },
    );
    expect(res.status).toBe(200);
    const args = mockPrisma.mgrReminder.update.mock.calls[0]?.[0] as {
      data: { snoozedUntilAt?: Date };
    };
    expect(args.data.snoozedUntilAt).toBeInstanceOf(Date);
  });

  it("edit updates body/periodicity", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce({
      id: "r1",
      ownerUserId: "u1",
      remindAt: new Date(),
      periodicity: "none",
    });
    mockPrisma.mgrReminder.update.mockResolvedValueOnce(fakeUpdated());
    const res = await PATCH(
      patchReq({ action: "edit", body: "Нове", periodicity: "weekly" }),
      { params },
    );
    expect(res.status).toBe(200);
    const args = mockPrisma.mgrReminder.update.mock.calls[0]?.[0] as {
      data: { body?: string; periodicity?: string };
    };
    expect(args.data.body).toBe("Нове");
    expect(args.data.periodicity).toBe("weekly");
  });

  it("completeItem marks item done; rolls up to completed when ALL done", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce({
      id: "r1",
      ownerUserId: "u1",
      remindAt: new Date(),
      periodicity: "event",
      isProductReminder: true,
      items: [
        { id: "it1", done: false },
        { id: "it2", done: true },
      ],
    });
    const res = await PATCH(
      patchReq({ action: "completeItem", itemId: "it1" }),
      { params },
    );
    expect(res.status).toBe(200);
    const itemArgs = mockPrisma.mgrReminderItem.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { done: boolean };
    };
    expect(itemArgs.where.id).toBe("it1");
    expect(itemArgs.data.done).toBe(true);
    // Усі рядки done → completedAt = Date.
    const remArgs = mockPrisma.mgrReminder.update.mock.calls[0]?.[0] as {
      data: { completedAt: Date | null };
    };
    expect(remArgs.data.completedAt).toBeInstanceOf(Date);
  });

  it("uncompleteItem unticks item; rolls reminder back to active (completedAt=null)", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce({
      id: "r1",
      ownerUserId: "u1",
      remindAt: new Date(),
      periodicity: "event",
      isProductReminder: true,
      items: [
        { id: "it1", done: true },
        { id: "it2", done: true },
      ],
    });
    const res = await PATCH(
      patchReq({ action: "uncompleteItem", itemId: "it1" }),
      { params },
    );
    expect(res.status).toBe(200);
    const remArgs = mockPrisma.mgrReminder.update.mock.calls[0]?.[0] as {
      data: { completedAt: Date | null };
    };
    expect(remArgs.data.completedAt).toBeNull();
  });

  it("completeItem 404 when item not in this reminder", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce({
      id: "r1",
      ownerUserId: "u1",
      remindAt: new Date(),
      periodicity: "event",
      isProductReminder: true,
      items: [{ id: "it1", done: false }],
    });
    const res = await PATCH(
      patchReq({ action: "completeItem", itemId: "nope" }),
      { params },
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.mgrReminderItem.update).not.toHaveBeenCalled();
  });

  it("complete on product reminder marks all items done + completedAt", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce({
      id: "r1",
      ownerUserId: "u1",
      remindAt: new Date(),
      periodicity: "event",
      isProductReminder: true,
      items: [
        { id: "it1", done: false },
        { id: "it2", done: false },
      ],
    });
    const res = await PATCH(patchReq({ action: "complete" }), { params });
    expect(res.status).toBe(200);
    const manyArgs = mockPrisma.mgrReminderItem.updateMany.mock
      .calls[0]?.[0] as {
      where: { reminderId: string };
      data: { done: boolean };
    };
    expect(manyArgs.where.reminderId).toBe("r1");
    expect(manyArgs.data.done).toBe(true);
    const remArgs = mockPrisma.mgrReminder.update.mock.calls[0]?.[0] as {
      data: { completedAt: Date | null };
    };
    expect(remArgs.data.completedAt).toBeInstanceOf(Date);
  });

  it("admin can complete another manager's reminder", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce({
      id: "r1",
      ownerUserId: "u1",
      remindAt: new Date("2026-05-20T08:00:00Z"),
      periodicity: "none",
    });
    mockPrisma.mgrReminder.update.mockResolvedValueOnce(fakeUpdated());
    const res = await PATCH(patchReq({ action: "complete" }), { params });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/manager/reminders/[id]", () => {
  it("404 when missing", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce(null);
    const res = await DELETE(delReq(), { params });
    expect(res.status).toBe(404);
  });

  it("403 when not owner", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce({
      id: "r1",
      ownerUserId: "other",
    });
    const res = await DELETE(delReq(), { params });
    expect(res.status).toBe(403);
    expect(mockPrisma.mgrReminder.delete).not.toHaveBeenCalled();
  });

  it("owner deletes", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce({
      id: "r1",
      ownerUserId: "u1",
    });
    mockPrisma.mgrReminder.delete.mockResolvedValueOnce({});
    const res = await DELETE(delReq(), { params });
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrReminder.delete).toHaveBeenCalled();
  });
});
