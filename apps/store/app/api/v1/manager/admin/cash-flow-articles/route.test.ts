import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, requireRoleMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrCashFlowArticle: { findMany: vi.fn(), create: vi.fn() },
  },
  requireRoleMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/manager-auth", () => ({
  requireRole: (...a: unknown[]) => requireRoleMock(...a),
}));

import { GET, POST } from "./route";

const ADMIN = { id: "admin1", role: "admin" as const };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/admin/cash-flow-articles",
    {
      method,
      ...(body !== undefined
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(ADMIN);
  mockPrisma.mgrCashFlowArticle.findMany.mockResolvedValue([]);
});

describe("GET /admin/cash-flow-articles", () => {
  it("returns 403 for non-admin", async () => {
    requireRoleMock.mockResolvedValueOnce(null);
    const res = await GET(req("GET"));
    expect(res.status).toBe(403);
  });

  it("lists articles for admin", async () => {
    mockPrisma.mgrCashFlowArticle.findMany.mockResolvedValueOnce([
      {
        id: "cf1",
        code: "01",
        name: "Оплата",
        parentId: null,
        archived: false,
      },
    ]);
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: unknown[] };
    expect(json.items).toHaveLength(1);
  });
});

describe("POST /admin/cash-flow-articles", () => {
  it("returns 400 on missing name", async () => {
    const res = await POST(req("POST", { code: "01" }));
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrCashFlowArticle.create).not.toHaveBeenCalled();
  });

  it("creates article with code + parent (201)", async () => {
    mockPrisma.mgrCashFlowArticle.create.mockResolvedValueOnce({
      id: "cf2",
      code: "02",
      name: "Витрати",
      parentId: "cf1",
      direction: "both",
      archived: false,
    });
    const res = await POST(
      req("POST", { name: "Витрати", code: "02", parentId: "cf1" }),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; parentId: string };
    expect(json.id).toBe("cf2");
    expect(json.parentId).toBe("cf1");
    // Дефолтний напрям передається у create.
    expect(mockPrisma.mgrCashFlowArticle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ direction: "both" }),
      }),
    );
  });

  it("round-trips explicit direction on create", async () => {
    mockPrisma.mgrCashFlowArticle.create.mockResolvedValueOnce({
      id: "cf3",
      code: null,
      name: "Оплата від покупця",
      parentId: null,
      direction: "income",
      archived: false,
    });
    const res = await POST(
      req("POST", { name: "Оплата від покупця", direction: "income" }),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { direction: string };
    expect(json.direction).toBe("income");
    expect(mockPrisma.mgrCashFlowArticle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ direction: "income" }),
      }),
    );
  });
});
