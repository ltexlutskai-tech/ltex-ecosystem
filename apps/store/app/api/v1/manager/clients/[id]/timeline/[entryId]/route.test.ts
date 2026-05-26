import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, canEditClientMock } = vi.hoisted(
  () => ({
    mockPrisma: {
      mgrClientTimelineEntry: {
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
    getCurrentUserMock: vi.fn(),
    canEditClientMock: vi.fn(),
  }),
);

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

vi.mock("@/lib/permissions/mgr-client-edit", () => ({
  canEditClient: (...args: unknown[]) => canEditClientMock(...args),
}));

import { PATCH, DELETE } from "./route";

const MANAGER_USER = {
  id: "u1",
  email: "alice@example.com",
  fullName: "Alice",
  role: "manager" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};

function makePatch(id: string, entryId: string, body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/clients/${id}/timeline/${entryId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function makeDelete(id: string, entryId: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/clients/${id}/timeline/${entryId}`,
    { method: "DELETE" },
  );
}

const ctx = (id: string, entryId: string) => ({
  params: Promise.resolve({ id, entryId }),
});

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
  canEditClientMock.mockResolvedValue(true);
});

describe("PATCH /clients/[id]/timeline/[entryId]", () => {
  it("401 коли не авторизовано", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await PATCH(
      makePatch("c1", "t1", { body: "новий" }),
      ctx("c1", "t1"),
    );
    expect(res.status).toBe(401);
  });

  it("404 коли запис не знайдено", async () => {
    mockPrisma.mgrClientTimelineEntry.findUnique.mockResolvedValueOnce(null);
    const res = await PATCH(
      makePatch("c1", "tX", { body: "новий" }),
      ctx("c1", "tX"),
    );
    expect(res.status).toBe(404);
  });

  it("404 коли запис належить іншому клієнту", async () => {
    mockPrisma.mgrClientTimelineEntry.findUnique.mockResolvedValueOnce({
      id: "t1",
      clientId: "OTHER",
      kind: "comment",
      authorUserId: "u1",
    });
    const res = await PATCH(
      makePatch("c1", "t1", { body: "новий" }),
      ctx("c1", "t1"),
    );
    expect(res.status).toBe(404);
  });

  it("400 коли спроба редагувати авто-запис (kind != comment)", async () => {
    mockPrisma.mgrClientTimelineEntry.findUnique.mockResolvedValueOnce({
      id: "t1",
      clientId: "c1",
      kind: "order",
      authorUserId: "u1",
    });
    const res = await PATCH(
      makePatch("c1", "t1", { body: "новий" }),
      ctx("c1", "t1"),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrClientTimelineEntry.update).not.toHaveBeenCalled();
  });

  it("403 коли немає доступу до клієнта", async () => {
    mockPrisma.mgrClientTimelineEntry.findUnique.mockResolvedValueOnce({
      id: "t1",
      clientId: "c1",
      kind: "comment",
      authorUserId: "u1",
    });
    canEditClientMock.mockResolvedValueOnce(false);
    const res = await PATCH(
      makePatch("c1", "t1", { body: "новий" }),
      ctx("c1", "t1"),
    );
    expect(res.status).toBe(403);
  });

  it("403 коли редагує чужий коментар (не автор, не admin)", async () => {
    mockPrisma.mgrClientTimelineEntry.findUnique.mockResolvedValueOnce({
      id: "t1",
      clientId: "c1",
      kind: "comment",
      authorUserId: "u2",
    });
    const res = await PATCH(
      makePatch("c1", "t1", { body: "новий" }),
      ctx("c1", "t1"),
    );
    expect(res.status).toBe(403);
  });

  it("оновлює власний коментар (happy path)", async () => {
    mockPrisma.mgrClientTimelineEntry.findUnique.mockResolvedValueOnce({
      id: "t1",
      clientId: "c1",
      kind: "comment",
      authorUserId: "u1",
    });
    mockPrisma.mgrClientTimelineEntry.update.mockResolvedValueOnce({
      id: "t1",
      kind: "comment",
      body: "новий",
      occurredAt: new Date(),
      author: { id: "u1", fullName: "Alice" },
      metadata: null,
    });
    const res = await PATCH(
      makePatch("c1", "t1", { body: "новий" }),
      ctx("c1", "t1"),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrClientTimelineEntry.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { body: "новий" },
      include: expect.any(Object),
    });
  });

  it("admin може редагувати чужий коментар", async () => {
    getCurrentUserMock.mockResolvedValueOnce({
      ...MANAGER_USER,
      role: "admin" as const,
    });
    mockPrisma.mgrClientTimelineEntry.findUnique.mockResolvedValueOnce({
      id: "t1",
      clientId: "c1",
      kind: "comment",
      authorUserId: "u2",
    });
    mockPrisma.mgrClientTimelineEntry.update.mockResolvedValueOnce({
      id: "t1",
      kind: "comment",
      body: "admin-edit",
      occurredAt: new Date(),
      author: { id: "u2", fullName: "Bob" },
      metadata: null,
    });
    const res = await PATCH(
      makePatch("c1", "t1", { body: "admin-edit" }),
      ctx("c1", "t1"),
    );
    expect(res.status).toBe(200);
  });
});

describe("DELETE /clients/[id]/timeline/[entryId]", () => {
  it("400 коли спроба видалити авто-запис", async () => {
    mockPrisma.mgrClientTimelineEntry.findUnique.mockResolvedValueOnce({
      id: "t1",
      clientId: "c1",
      kind: "payment",
      authorUserId: "u1",
    });
    const res = await DELETE(makeDelete("c1", "t1"), ctx("c1", "t1"));
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrClientTimelineEntry.delete).not.toHaveBeenCalled();
  });

  it("видаляє власний коментар (happy path)", async () => {
    mockPrisma.mgrClientTimelineEntry.findUnique.mockResolvedValueOnce({
      id: "t1",
      clientId: "c1",
      kind: "comment",
      authorUserId: "u1",
    });
    mockPrisma.mgrClientTimelineEntry.delete.mockResolvedValueOnce({
      id: "t1",
    });
    const res = await DELETE(makeDelete("c1", "t1"), ctx("c1", "t1"));
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrClientTimelineEntry.delete).toHaveBeenCalledWith({
      where: { id: "t1" },
    });
  });
});
