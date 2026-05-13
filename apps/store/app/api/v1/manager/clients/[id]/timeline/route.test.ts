import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrClient: {
      findUnique: vi.fn(),
    },
    mgrClientTimelineEntry: {
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
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

import { GET, POST } from "./route";

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

function makeGet(id: string, qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/clients/${id}/timeline${qs ? `?${qs}` : ""}`,
    { method: "GET" },
  );
}

function makePost(id: string, body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/clients/${id}/timeline`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
  mockPrisma.mgrClient.findUnique.mockResolvedValue({ id: "c1" });
});

describe("GET /api/v1/manager/clients/[id]/timeline", () => {
  it("returns 404 when client missing", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(null);
    mockPrisma.mgrClientTimelineEntry.count.mockResolvedValue(0);
    mockPrisma.mgrClientTimelineEntry.findMany.mockResolvedValue([]);
    const res = await GET(makeGet("missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns paginated entries on happy path", async () => {
    mockPrisma.mgrClientTimelineEntry.count.mockResolvedValue(2);
    mockPrisma.mgrClientTimelineEntry.findMany.mockResolvedValue([
      {
        id: "t1",
        kind: "payment",
        body: "Test",
        occurredAt: new Date(),
        author: null,
        metadata: null,
      },
    ]);
    const res = await GET(makeGet("c1"), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { entries: unknown[]; total: number };
    expect(json.entries).toHaveLength(1);
    expect(json.total).toBe(2);
  });
});

describe("POST /api/v1/manager/clients/[id]/timeline", () => {
  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(makePost("c1", { body: "hi" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is empty", async () => {
    const res = await POST(makePost("c1", { body: "   " }), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(400);
  });

  it("creates manual comment + sets author to current user", async () => {
    mockPrisma.mgrClientTimelineEntry.create.mockResolvedValue({
      id: "t-new",
      kind: "comment",
      body: "Hello",
      occurredAt: new Date(),
      author: { id: "u1", fullName: "Alice" },
      metadata: null,
    });
    const res = await POST(makePost("c1", { body: "Hello" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(201);
    expect(mockPrisma.mgrClientTimelineEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: "c1",
        kind: "comment",
        body: "Hello",
        authorUserId: "u1",
      }),
      include: expect.any(Object),
    });
  });
});
