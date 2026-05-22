import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, requireRoleMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrCashFlowArticle: { update: vi.fn() },
  },
  requireRoleMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
vi.mock("@/lib/auth/manager-auth", () => ({
  requireRole: (...a: unknown[]) => requireRoleMock(...a),
}));

import { PATCH } from "./route";

const ADMIN = { id: "admin1", role: "admin" as const };

function patchReq(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/admin/cash-flow-articles/cf1",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
const params = Promise.resolve({ id: "cf1" });

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(ADMIN);
});

describe("PATCH /admin/cash-flow-articles/[id]", () => {
  it("returns 403 for non-admin", async () => {
    requireRoleMock.mockResolvedValueOnce(null);
    const res = await PATCH(patchReq({ archived: true }), { params });
    expect(res.status).toBe(403);
  });

  it("rejects self-parent (400)", async () => {
    const res = await PATCH(patchReq({ parentId: "cf1" }), { params });
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrCashFlowArticle.update).not.toHaveBeenCalled();
  });

  it("renames article (200)", async () => {
    mockPrisma.mgrCashFlowArticle.update.mockResolvedValueOnce({
      id: "cf1",
      code: "01",
      name: "Нова назва",
      parentId: null,
      archived: false,
    });
    const res = await PATCH(patchReq({ name: "Нова назва" }), { params });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { name: string };
    expect(json.name).toBe("Нова назва");
  });
});
