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

const reverseSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const reapplySpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/manager/deletion-movements", () => ({
  reverseDocMovements: reverseSpy,
  reapplyDocMovements: reapplySpy,
}));

const findReferencesSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/manager/reference-check", () => ({
  findReferences: findReferencesSpy,
}));

import {
  markForDeletion,
  approveDeletion,
  rejectDeletion,
  restoreDeletionRequest,
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

  it("reapplies movements on reject (document doc types)", async () => {
    mockDb.deletionRequest.findUnique.mockResolvedValue({
      id: "req4b",
      entityType: "sale",
      entityId: "s4",
      entityLabel: "Реалізація 1",
      dictType: null,
      status: "pending",
    });
    mockDb.sale.update.mockResolvedValue({});
    mockDb.deletionRequest.update.mockResolvedValue({});

    await rejectDeletion("req4b", admin, null);
    expect(reapplySpy).toHaveBeenCalledWith("sale", "s4");
  });
});

describe("reverse movements on mark", () => {
  it("reverses movements immediately when marking a sale", async () => {
    mockDb.sale.findUnique.mockResolvedValue({ number1C: "L1", docNumber: 1 });
    mockDb.deletionRequest.findFirst.mockResolvedValue(null);
    mockDb.sale.update.mockResolvedValue({});
    mockDb.deletionRequest.create.mockResolvedValue({ id: "reqS" });

    const res = await markForDeletion({
      entityType: "sale",
      entityId: "s1",
      reason: "дублікат",
      user,
    });

    expect(res.ok).toBe(true);
    expect(reverseSpy).toHaveBeenCalledWith("sale", "s1");
  });
});

describe("restoreDeletionRequest", () => {
  const pendingReq = {
    id: "reqR",
    entityType: "sale",
    entityId: "s5",
    entityLabel: "Реалізація 5",
    dictType: null,
    status: "pending",
    requestedByUserId: "u1",
  };

  it("restores own pending request: unmark + reapply + status rejected", async () => {
    mockDb.deletionRequest.findUnique.mockResolvedValue(pendingReq);
    mockDb.sale.update.mockResolvedValue({});
    mockDb.deletionRequest.update.mockResolvedValue({});

    const res = await restoreDeletionRequest("reqR", user, false);
    expect(res.ok).toBe(true);
    expect(mockDb.sale.update).toHaveBeenCalledWith({
      where: { id: "s5" },
      data: { markedForDeletion: false },
    });
    expect(reapplySpy).toHaveBeenCalledWith("sale", "s5");
    expect(mockDb.deletionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "rejected",
          resolutionNote: "Повернено з кошика",
        }),
      }),
    );
  });

  it("forbids restoring someone else's request (non-admin)", async () => {
    mockDb.deletionRequest.findUnique.mockResolvedValue({
      ...pendingReq,
      requestedByUserId: "other",
    });

    const res = await restoreDeletionRequest("reqR", user, false);
    expect(res.ok).toBe(false);
    expect(reapplySpy).not.toHaveBeenCalled();
  });

  it("admin may restore any pending request", async () => {
    mockDb.deletionRequest.findUnique.mockResolvedValue({
      ...pendingReq,
      requestedByUserId: "other",
    });
    mockDb.sale.update.mockResolvedValue({});
    mockDb.deletionRequest.update.mockResolvedValue({});

    const res = await restoreDeletionRequest("reqR", admin, true);
    expect(res.ok).toBe(true);
    expect(reapplySpy).toHaveBeenCalledWith("sale", "s5");
  });

  it("rejects an already-resolved request", async () => {
    mockDb.deletionRequest.findUnique.mockResolvedValue({
      ...pendingReq,
      status: "approved",
    });
    const res = await restoreDeletionRequest("reqR", user, false);
    expect(res.ok).toBe(false);
  });
});
