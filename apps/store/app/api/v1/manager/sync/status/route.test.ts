import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrSyncJob: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
  },
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

import { GET } from "./route";

const MANAGER = {
  id: "u1",
  email: "x@x",
  fullName: "X",
  role: "manager" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/manager/sync/status", () => {
  it("401 без auth", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/v1/manager/sync/status");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns counts + lastSentAt для авторизованого manager-а", async () => {
    getCurrentUserMock.mockResolvedValueOnce(MANAGER);
    mockPrisma.mgrSyncJob.count
      .mockResolvedValueOnce(3) // pending
      .mockResolvedValueOnce(1) // retrying
      .mockResolvedValueOnce(0); // failed
    const sentAt = new Date("2026-05-15T10:00:00.000Z");
    mockPrisma.mgrSyncJob.findFirst.mockResolvedValueOnce({ sentAt });

    const req = new NextRequest("http://localhost/api/v1/manager/sync/status");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pendingCount: number;
      retryingCount: number;
      failedCount: number;
      queuedCount: number;
      lastSentAt: string | null;
    };
    expect(body.pendingCount).toBe(3);
    expect(body.retryingCount).toBe(1);
    expect(body.failedCount).toBe(0);
    expect(body.queuedCount).toBe(4);
    expect(body.lastSentAt).toBe(sentAt.toISOString());
  });

  it("lastSentAt = null коли жодного sent job ще немає", async () => {
    getCurrentUserMock.mockResolvedValueOnce(MANAGER);
    mockPrisma.mgrSyncJob.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockPrisma.mgrSyncJob.findFirst.mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost/api/v1/manager/sync/status");
    const res = await GET(req);
    const body = (await res.json()) as {
      lastSentAt: string | null;
      queuedCount: number;
    };
    expect(body.lastSentAt).toBeNull();
    expect(body.queuedCount).toBe(0);
  });
});
