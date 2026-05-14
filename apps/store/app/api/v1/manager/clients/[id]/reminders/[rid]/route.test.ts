import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrReminder: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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

import { PATCH, DELETE } from "./route";

type ManagerRole = "manager" | "senior_manager" | "admin";

const USER: {
  id: string;
  email: string;
  fullName: string;
  role: ManagerRole;
  isActive: boolean;
  code1C: string | null;
  telegramLinked: boolean;
  notifyChannels: string[];
  lastSeenAt: Date | null;
} = {
  id: "u1",
  email: "a@b.c",
  fullName: "Alice",
  role: "manager",
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};

const ADMIN: typeof USER = { ...USER, id: "admin1", role: "admin" };

const ownedReminder = {
  id: "r1",
  clientId: "c1",
  ownerUserId: "u1",
  body: "test",
  remindAt: new Date("2026-05-20T10:00:00Z"),
  completedAt: null,
  snoozedUntilAt: null,
  createdAt: new Date(),
  owner: { id: "u1", fullName: "Alice" },
};

const otherUsersReminder = { ...ownedReminder, ownerUserId: "u2" };

function patchReq(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/clients/c1/reminders/r1",
    {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    },
  );
}

function deleteReq(): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/clients/c1/reminders/r1",
    { method: "DELETE" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
});

describe("PATCH /reminders/[rid]", () => {
  it("returns 401 unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await PATCH(patchReq({ action: "complete" }), {
      params: Promise.resolve({ id: "c1", rid: "r1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 if reminder not found", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce(null);
    const res = await PATCH(patchReq({ action: "complete" }), {
      params: Promise.resolve({ id: "c1", rid: "r1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when not owner and not admin", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce(otherUsersReminder);
    const res = await PATCH(patchReq({ action: "complete" }), {
      params: Promise.resolve({ id: "c1", rid: "r1" }),
    });
    expect(res.status).toBe(403);
  });

  it("allows admin to complete other user's reminder", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce(otherUsersReminder);
    mockPrisma.mgrReminder.update.mockResolvedValueOnce({
      ...otherUsersReminder,
      completedAt: new Date(),
    });
    const res = await PATCH(patchReq({ action: "complete" }), {
      params: Promise.resolve({ id: "c1", rid: "r1" }),
    });
    expect(res.status).toBe(200);
  });

  it("snooze action sets snoozedUntilAt from payload", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce(ownedReminder);
    mockPrisma.mgrReminder.update.mockResolvedValueOnce({
      ...ownedReminder,
      snoozedUntilAt: new Date("2026-05-25T09:00:00Z"),
    });
    const res = await PATCH(
      patchReq({ action: "snooze", snoozedUntil: "2026-05-25T09:00:00Z" }),
      { params: Promise.resolve({ id: "c1", rid: "r1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrReminder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ snoozedUntilAt: expect.any(Date) }),
      }),
    );
  });
});

describe("DELETE /reminders/[rid]", () => {
  it("returns 403 when not owner", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce(otherUsersReminder);
    const res = await DELETE(deleteReq(), {
      params: Promise.resolve({ id: "c1", rid: "r1" }),
    });
    expect(res.status).toBe(403);
  });

  it("hard-deletes when owner", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValueOnce(ownedReminder);
    mockPrisma.mgrReminder.delete.mockResolvedValueOnce(ownedReminder);
    const res = await DELETE(deleteReq(), {
      params: Promise.resolve({ id: "c1", rid: "r1" }),
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrReminder.delete).toHaveBeenCalledWith({
      where: { id: "r1" },
    });
  });
});
