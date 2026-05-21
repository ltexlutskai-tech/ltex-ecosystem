import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, FakeKnownRequestError } = vi.hoisted(
  () => {
    class FakeKnownRequestError extends Error {
      code: string;
      constructor(code: string) {
        super(code);
        this.code = code;
      }
    }
    return {
      mockPrisma: {
        mgrMessageTemplate: {
          update: vi.fn(),
          delete: vi.fn(),
        },
      },
      getCurrentUserMock: vi.fn(),
      FakeKnownRequestError,
    };
  },
);

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: {
    PrismaClientKnownRequestError: FakeKnownRequestError,
  },
}));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
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

const NOW = new Date("2026-05-21T10:00:00.000Z");

const fakeTemplate = {
  id: "t1",
  name: "Оновлено",
  text: "Новий текст",
  createdByUserId: "u1",
  createdAt: NOW,
  updatedAt: NOW,
};

function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function makePatch(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/message-templates/t1",
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

function makeDelete(): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/message-templates/t1",
    { method: "DELETE" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
  mockPrisma.mgrMessageTemplate.update.mockResolvedValue(fakeTemplate);
  mockPrisma.mgrMessageTemplate.delete.mockResolvedValue(fakeTemplate);
});

describe("PATCH /api/v1/manager/message-templates/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await PATCH(makePatch({ name: "X", text: "Y" }), params("t1"));
    expect(res.status).toBe(401);
    expect(mockPrisma.mgrMessageTemplate.update).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid body", async () => {
    const res = await PATCH(makePatch({ name: "", text: "Y" }), params("t1"));
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrMessageTemplate.update).not.toHaveBeenCalled();
  });

  it("updates name and text (trimmed)", async () => {
    const res = await PATCH(
      makePatch({ name: "  Оновлено  ", text: "  Новий текст  " }),
      params("t1"),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrMessageTemplate.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { name: "Оновлено", text: "Новий текст" },
    });
  });

  it("returns 404 when template not found", async () => {
    mockPrisma.mgrMessageTemplate.update.mockRejectedValueOnce(
      new FakeKnownRequestError("P2025"),
    );
    const res = await PATCH(
      makePatch({ name: "X", text: "Y" }),
      params("missing"),
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/manager/message-templates/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await DELETE(makeDelete(), params("t1"));
    expect(res.status).toBe(401);
    expect(mockPrisma.mgrMessageTemplate.delete).not.toHaveBeenCalled();
  });

  it("deletes the template", async () => {
    const res = await DELETE(makeDelete(), params("t1"));
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrMessageTemplate.delete).toHaveBeenCalledWith({
      where: { id: "t1" },
    });
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it("returns 404 when template not found", async () => {
    mockPrisma.mgrMessageTemplate.delete.mockRejectedValueOnce(
      new FakeKnownRequestError("P2025"),
    );
    const res = await DELETE(makeDelete(), params("missing"));
    expect(res.status).toBe(404);
  });
});
