import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, requireRoleMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrBankAccount: { findMany: vi.fn(), create: vi.fn() },
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
    "http://localhost/api/v1/manager/admin/bank-accounts",
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
  mockPrisma.mgrBankAccount.findMany.mockResolvedValue([]);
});

describe("GET /admin/bank-accounts", () => {
  it("returns 403 for non-admin", async () => {
    requireRoleMock.mockResolvedValueOnce(null);
    const res = await GET(req("GET"));
    expect(res.status).toBe(403);
  });

  it("lists accounts incl. archived for admin", async () => {
    mockPrisma.mgrBankAccount.findMany.mockResolvedValueOnce([
      {
        id: "ba1",
        name: "X",
        description: null,
        hiddenInApp: false,
        archived: true,
      },
    ]);
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: unknown[] };
    expect(json.items).toHaveLength(1);
  });
});

describe("POST /admin/bank-accounts", () => {
  it("returns 403 for non-admin", async () => {
    requireRoleMock.mockResolvedValueOnce(null);
    const res = await POST(req("POST", { name: "X" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 on missing name", async () => {
    const res = await POST(req("POST", { description: "x" }));
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrBankAccount.create).not.toHaveBeenCalled();
  });

  it("creates account with default kind (201)", async () => {
    mockPrisma.mgrBankAccount.create.mockResolvedValueOnce({
      id: "ba1",
      name: "ПриватБанк",
      description: null,
      kind: "account",
      hiddenInApp: false,
      archived: false,
    });
    const res = await POST(req("POST", { name: "ПриватБанк" }));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; kind: string };
    expect(json.id).toBe("ba1");
    expect(json.kind).toBe("account");
    expect(mockPrisma.mgrBankAccount.create).toHaveBeenCalledOnce();
  });

  it("round-trips explicit kind on create (201)", async () => {
    mockPrisma.mgrBankAccount.create.mockResolvedValueOnce({
      id: "ba2",
      name: "Готівка магазин",
      description: null,
      kind: "cash",
      hiddenInApp: false,
      archived: false,
    });
    const res = await POST(
      req("POST", { name: "Готівка магазин", kind: "cash" }),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { kind: string };
    expect(json.kind).toBe("cash");
    expect(mockPrisma.mgrBankAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "cash" }),
      }),
    );
  });
});
