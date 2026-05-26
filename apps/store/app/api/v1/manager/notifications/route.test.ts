import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrReminder: {
      count: vi.fn(),
      findMany: vi.fn(),
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

const USER = {
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

function req(): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/notifications");
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
});

describe("GET /api/v1/manager/notifications", () => {
  it("returns 401 if not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns overdueCount + items (max 10) for current user only", async () => {
    mockPrisma.mgrReminder.count.mockResolvedValueOnce(3);
    mockPrisma.mgrReminder.findMany.mockResolvedValueOnce([
      {
        id: "r1",
        body: "Test",
        remindAt: new Date("2026-05-13T10:00:00Z"),
        snoozedUntilAt: null,
        client: { id: "c1", name: "Client A" },
      },
    ]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      overdueCount: number;
      items: { id: string; client: { id: string; name: string } }[];
    };
    expect(json.overdueCount).toBe(3);
    expect(json.items).toHaveLength(1);
    expect(json.items[0]?.client.name).toBe("Client A");
    expect(mockPrisma.mgrReminder.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerUserId: "u1" }),
      }),
    );
    expect(mockPrisma.mgrReminder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });

  it("excludes event-type reminders (product checklists do not time-nag)", async () => {
    mockPrisma.mgrReminder.count.mockResolvedValueOnce(0);
    mockPrisma.mgrReminder.findMany.mockResolvedValueOnce([]);
    await GET(req());
    expect(mockPrisma.mgrReminder.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          periodicity: { not: "event" },
          completedAt: null,
        }),
      }),
    );
  });
});
