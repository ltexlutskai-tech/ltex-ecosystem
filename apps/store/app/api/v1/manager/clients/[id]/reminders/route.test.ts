import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrClient: { findUnique: vi.fn() },
    mgrReminder: { findMany: vi.fn(), create: vi.fn() },
  },
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

import { GET, POST } from "./route";

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

function getReq(): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/clients/c1/reminders",
  );
}

function postReq(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/clients/c1/reminders",
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
});

describe("GET /reminders", () => {
  it("returns 401 if not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 if client not found", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(null);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(404);
  });

  it("returns serialized list on success", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({ id: "c1" });
    mockPrisma.mgrReminder.findMany.mockResolvedValueOnce([
      {
        id: "r1",
        body: "test",
        remindAt: new Date("2026-05-20T10:00:00Z"),
        completedAt: null,
        snoozedUntilAt: null,
        createdAt: new Date("2026-05-14T10:00:00Z"),
        owner: { id: "u1", fullName: "Alice" },
      },
    ]);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ id: string; body: string }>;
    };
    expect(json.items).toHaveLength(1);
    expect(json.items[0]?.id).toBe("r1");
  });
});

describe("POST /reminders", () => {
  beforeEach(() => {
    mockPrisma.mgrClient.findUnique.mockResolvedValue({ id: "c1" });
  });

  it("returns 401 if not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(
      postReq({ body: "x", remindAt: "2026-05-20T10:00:00Z" }),
      {
        params: Promise.resolve({ id: "c1" }),
      },
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on empty body", async () => {
    const res = await POST(
      postReq({ body: "", remindAt: "2026-05-20T10:00:00Z" }),
      {
        params: Promise.resolve({ id: "c1" }),
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid date", async () => {
    const res = await POST(postReq({ body: "test", remindAt: "not-a-date" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(400);
  });

  it("creates reminder and returns 201 with ownerUserId=current user", async () => {
    mockPrisma.mgrReminder.create.mockResolvedValueOnce({
      id: "r1",
      body: "test",
      remindAt: new Date("2026-05-20T10:00:00Z"),
      completedAt: null,
      snoozedUntilAt: null,
      createdAt: new Date(),
      owner: { id: "u1", fullName: "Alice" },
    });
    const res = await POST(
      postReq({ body: "test", remindAt: "2026-05-20T10:00:00Z" }),
      {
        params: Promise.resolve({ id: "c1" }),
      },
    );
    expect(res.status).toBe(201);
    expect(mockPrisma.mgrReminder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: "c1",
          ownerUserId: "u1",
          body: "test",
        }),
      }),
    );
  });
});
