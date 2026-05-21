import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrMessageTemplate: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: {},
}));

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

const NOW = new Date("2026-05-21T10:00:00.000Z");

const fakeTemplate = {
  id: "t1",
  name: "Привітання",
  text: "Доброго дня!",
  createdByUserId: "u1",
  createdAt: NOW,
  updatedAt: NOW,
};

function makeGet(): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/message-templates", {
    method: "GET",
  });
}

function makePost(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/message-templates", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
  mockPrisma.mgrMessageTemplate.findMany.mockResolvedValue([fakeTemplate]);
  mockPrisma.mgrMessageTemplate.create.mockResolvedValue(fakeTemplate);
});

describe("GET /api/v1/manager/message-templates", () => {
  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
    expect(mockPrisma.mgrMessageTemplate.findMany).not.toHaveBeenCalled();
  });

  it("returns all templates ordered by name asc", async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      templates: { id: string; name: string; text: string }[];
    };
    expect(json.templates).toHaveLength(1);
    expect(json.templates[0]?.id).toBe("t1");
    expect(mockPrisma.mgrMessageTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: "asc" } }),
    );
  });

  it("serializes dates to ISO strings", async () => {
    const res = await GET(makeGet());
    const json = (await res.json()) as {
      templates: { createdAt: string; updatedAt: string }[];
    };
    expect(json.templates[0]?.createdAt).toBe(NOW.toISOString());
    expect(json.templates[0]?.updatedAt).toBe(NOW.toISOString());
  });
});

describe("POST /api/v1/manager/message-templates", () => {
  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(makePost({ name: "X", text: "Y" }));
    expect(res.status).toBe(401);
    expect(mockPrisma.mgrMessageTemplate.create).not.toHaveBeenCalled();
  });

  it("returns 400 on empty name", async () => {
    const res = await POST(makePost({ name: "   ", text: "Y" }));
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrMessageTemplate.create).not.toHaveBeenCalled();
  });

  it("returns 400 on missing text", async () => {
    const res = await POST(makePost({ name: "Назва" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on too-long name", async () => {
    const res = await POST(makePost({ name: "x".repeat(101), text: "Y" }));
    expect(res.status).toBe(400);
  });

  it("creates the template with createdByUserId = current manager", async () => {
    const res = await POST(
      makePost({ name: "Привітання", text: "Доброго дня!" }),
    );
    expect(res.status).toBe(201);
    expect(mockPrisma.mgrMessageTemplate.create).toHaveBeenCalledWith({
      data: {
        name: "Привітання",
        text: "Доброго дня!",
        createdByUserId: "u1",
      },
    });
    const json = (await res.json()) as { template: { id: string } };
    expect(json.template.id).toBe("t1");
  });

  it("trims name and text before persisting", async () => {
    await POST(makePost({ name: "  Знижка  ", text: "  Маємо акцію!  " }));
    expect(mockPrisma.mgrMessageTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Знижка", text: "Маємо акцію!" }),
    });
  });
});
