import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = vi.hoisted(() => ({
  deletionRequest: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
  },
  mgrClient: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  order: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  sale: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  mgrCashOrder: { findUnique: vi.fn(), update: vi.fn() },
  routeSheet: { findUnique: vi.fn(), update: vi.fn() },
  mgrRoute: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock("@ltex/db", () => ({ prisma: mockDb }));

const auditSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audit/audit-log", () => ({ logAuditEvent: auditSpy }));

const timelineSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/manager/client-timeline", () => ({
  recordClientEventSafe: timelineSpy,
}));

vi.mock("@/lib/manager/debt-register", () => ({
  recomputeDebtForClients: vi.fn().mockResolvedValue(0),
}));

const findReferencesSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/manager/reference-check", () => ({
  findReferences: findReferencesSpy,
}));

import {
  markForDeletion,
  approveDeletion,
  rejectDeletion,
} from "./deletion-queue";

const user = {
  id: "u1",
  email: "m@ltex.ua",
  fullName: "Менеджер",
  role: "manager" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};
const admin = { ...user, id: "a1", email: "a@ltex.ua", role: "admin" as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("markForDeletion", () => {
  it("rejects reason shorter than 3 chars", async () => {
    const res = await markForDeletion({
      entityType: "client",
      entityId: "c1",
      reason: "ab",
      user,
    });
    expect(res.ok).toBe(false);
    expect(mockDb.deletionRequest.create).not.toHaveBeenCalled();
  });

  it("creates request, sets flag, logs audit + timeline for client", async () => {
    mockDb.mgrClient.findUnique.mockResolvedValue({ name: "ТОВ Ромашка" });
    mockDb.deletionRequest.findFirst.mockResolvedValue(null);
    mockDb.mgrClient.update.mockResolvedValue({});
    mockDb.deletionRequest.create.mockResolvedValue({ id: "req1" });

    const res = await markForDeletion({
      entityType: "client",
      entityId: "c1",
      reason: "Дублікат картки",
      user,
    });

    expect(res.ok).toBe(true);
    expect(res.requestId).toBe("req1");
    expect(mockDb.mgrClient.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { markedForDeletion: true },
    });
    expect(mockDb.deletionRequest.create).toHaveBeenCalled();
    expect(auditSpy).toHaveBeenCalled();
    expect(timelineSpy).toHaveBeenCalled();
  });

  it("does not duplicate an existing pending request", async () => {
    mockDb.mgrClient.findUnique.mockResolvedValue({ name: "ТОВ Ромашка" });
    mockDb.deletionRequest.findFirst.mockResolvedValue({ id: "existing" });
    mockDb.mgrClient.update.mockResolvedValue({});

    const res = await markForDeletion({
      entityType: "client",
      entityId: "c1",
      reason: "Ще раз",
      user,
    });

    expect(res.requestId).toBe("existing");
    expect(mockDb.deletionRequest.create).not.toHaveBeenCalled();
    expect(mockDb.mgrClient.update).toHaveBeenCalled();
  });
});

describe("approveDeletion", () => {
  it("hard-deletes when no references and not 1C", async () => {
    mockDb.deletionRequest.findUnique.mockResolvedValue({
      id: "req1",
      entityType: "client",
      entityId: "c1",
      entityLabel: "ТОВ Ромашка",
      dictType: null,
      status: "pending",
    });
    findReferencesSpy.mockResolvedValue({
      found: true,
      isHistorical1C: false,
      canHardDelete: true,
      blockers: [],
    });
    mockDb.mgrClient.delete.mockResolvedValue({});
    mockDb.deletionRequest.update.mockResolvedValue({});

    const res = await approveDeletion("req1", admin);
    expect(res.ok).toBe(true);
    expect(res.outcome).toBe("deleted");
    expect(mockDb.mgrClient.delete).toHaveBeenCalledWith({
      where: { id: "c1" },
    });
  });

  it("archives when references block deletion", async () => {
    mockDb.deletionRequest.findUnique.mockResolvedValue({
      id: "req2",
      entityType: "client",
      entityId: "c2",
      entityLabel: "ТОВ Борг",
      dictType: null,
      status: "pending",
    });
    findReferencesSpy.mockResolvedValue({
      found: true,
      isHistorical1C: true,
      canHardDelete: false,
      blockers: [{ label: "Рухи боргу", count: 5 }],
    });
    mockDb.mgrClient.update.mockResolvedValue({});
    mockDb.deletionRequest.update.mockResolvedValue({});

    const res = await approveDeletion("req2", admin);
    expect(res.outcome).toBe("archived");
    expect(mockDb.mgrClient.update).toHaveBeenCalledWith({
      where: { id: "c2" },
      data: { archived: true, markedForDeletion: false },
    });
    expect(mockDb.mgrClient.delete).not.toHaveBeenCalled();
  });

  it("rejects an already-resolved request", async () => {
    mockDb.deletionRequest.findUnique.mockResolvedValue({
      id: "req3",
      status: "approved",
    });
    const res = await approveDeletion("req3", admin);
    expect(res.ok).toBe(false);
  });
});

describe("rejectDeletion", () => {
  it("clears the mark and sets status rejected", async () => {
    mockDb.deletionRequest.findUnique.mockResolvedValue({
      id: "req4",
      entityType: "client",
      entityId: "c4",
      entityLabel: "ТОВ Помилка",
      dictType: null,
      status: "pending",
    });
    mockDb.mgrClient.update.mockResolvedValue({});
    mockDb.deletionRequest.update.mockResolvedValue({});

    const res = await rejectDeletion("req4", admin, "Потрібен ще");
    expect(res.ok).toBe(true);
    expect(mockDb.mgrClient.update).toHaveBeenCalledWith({
      where: { id: "c4" },
      data: { markedForDeletion: false },
    });
    expect(mockDb.deletionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "rejected" }),
      }),
    );
  });
});
