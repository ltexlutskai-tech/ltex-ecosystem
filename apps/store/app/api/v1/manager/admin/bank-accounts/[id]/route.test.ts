import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, requireRoleMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrBankAccount: { update: vi.fn() },
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
    "http://localhost/api/v1/manager/admin/bank-accounts/ba1",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
const params = Promise.resolve({ id: "ba1" });

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(ADMIN);
});

describe("PATCH /admin/bank-accounts/[id]", () => {
  it("returns 403 for non-admin", async () => {
    requireRoleMock.mockResolvedValueOnce(null);
    const res = await PATCH(patchReq({ archived: true }), { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 when body empty (no fields)", async () => {
    const res = await PATCH(patchReq({}), { params });
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrBankAccount.update).not.toHaveBeenCalled();
  });

  it("toggles hiddenInApp (200)", async () => {
    mockPrisma.mgrBankAccount.update.mockResolvedValueOnce({
      id: "ba1",
      name: "X",
      description: null,
      hiddenInApp: true,
      archived: false,
    });
    const res = await PATCH(patchReq({ hiddenInApp: true }), { params });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { hiddenInApp: boolean };
    expect(json.hiddenInApp).toBe(true);
  });

  it("archives an account (200)", async () => {
    mockPrisma.mgrBankAccount.update.mockResolvedValueOnce({
      id: "ba1",
      name: "X",
      description: null,
      kind: "account",
      hiddenInApp: false,
      archived: true,
    });
    const res = await PATCH(patchReq({ archived: true }), { params });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { archived: boolean };
    expect(json.archived).toBe(true);
  });

  it("updates kind and round-trips it (200)", async () => {
    mockPrisma.mgrBankAccount.update.mockResolvedValueOnce({
      id: "ba1",
      name: "X",
      description: null,
      kind: "card",
      hiddenInApp: false,
      archived: false,
    });
    const res = await PATCH(patchReq({ kind: "card" }), { params });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { kind: string };
    expect(json.kind).toBe("card");
    expect(mockPrisma.mgrBankAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "card" }),
      }),
    );
  });
});
