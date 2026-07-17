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
          findUnique: vi.fn(),
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
  isAdminRole: (role: string) => role === "admin" || role === "owner",
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
  isShared: false,
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
  // За замовчуванням шаблон належить поточному менеджеру (u1).
  mockPrisma.mgrMessageTemplate.findUnique.mockResolvedValue({
    createdByUserId: "u1",
  });
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

  it("updates name, text (trimmed) and isShared for the author", async () => {
    const res = await PATCH(
      makePatch({
        name: "  Оновлено  ",
        text: "  Новий текст  ",
        isShared: true,
      }),
      params("t1"),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrMessageTemplate.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { name: "Оновлено", text: "Новий текст", isShared: true },
    });
  });

  it("returns 404 when template not found", async () => {
    mockPrisma.mgrMessageTemplate.findUnique.mockResolvedValueOnce(null);
    const res = await PATCH(
      makePatch({ name: "X", text: "Y" }),
      params("missing"),
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.mgrMessageTemplate.update).not.toHaveBeenCalled();
  });

  it("returns 403 when a non-author manager edits", async () => {
    mockPrisma.mgrMessageTemplate.findUnique.mockResolvedValueOnce({
      createdByUserId: "someone-else",
    });
    const res = await PATCH(makePatch({ name: "X", text: "Y" }), params("t1"));
    expect(res.status).toBe(403);
    expect(mockPrisma.mgrMessageTemplate.update).not.toHaveBeenCalled();
  });

  it("allows admin to edit another manager's template", async () => {
    getCurrentUserMock.mockResolvedValueOnce({
      ...MANAGER_USER,
      role: "admin",
    });
    mockPrisma.mgrMessageTemplate.findUnique.mockResolvedValueOnce({
      createdByUserId: "someone-else",
    });
    const res = await PATCH(makePatch({ name: "X", text: "Y" }), params("t1"));
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrMessageTemplate.update).toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/manager/message-templates/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await DELETE(makeDelete(), params("t1"));
    expect(res.status).toBe(401);
    expect(mockPrisma.mgrMessageTemplate.delete).not.toHaveBeenCalled();
  });

  it("deletes the template for the author", async () => {
    const res = await DELETE(makeDelete(), params("t1"));
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrMessageTemplate.delete).toHaveBeenCalledWith({
      where: { id: "t1" },
    });
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it("returns 404 when template not found", async () => {
    mockPrisma.mgrMessageTemplate.findUnique.mockResolvedValueOnce(null);
    const res = await DELETE(makeDelete(), params("missing"));
    expect(res.status).toBe(404);
    expect(mockPrisma.mgrMessageTemplate.delete).not.toHaveBeenCalled();
  });

  it("returns 403 when a non-author manager deletes", async () => {
    mockPrisma.mgrMessageTemplate.findUnique.mockResolvedValueOnce({
      createdByUserId: "someone-else",
    });
    const res = await DELETE(makeDelete(), params("t1"));
    expect(res.status).toBe(403);
    expect(mockPrisma.mgrMessageTemplate.delete).not.toHaveBeenCalled();
  });

  it("still maps a race-condition P2025 on delete to 404", async () => {
    mockPrisma.mgrMessageTemplate.delete.mockRejectedValueOnce(
      new FakeKnownRequestError("P2025"),
    );
    const res = await DELETE(makeDelete(), params("t1"));
    expect(res.status).toBe(404);
  });
});
