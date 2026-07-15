import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const {
  mockPrisma,
  getCurrentUserMock,
  recomputeDebtMock,
  recordClientEventSafeMock,
} = vi.hoisted(() => ({
  mockPrisma: {
    mgrClient: { findUnique: vi.fn() },
    mgrDebtMovement: { create: vi.fn() },
  },
  getCurrentUserMock: vi.fn(),
  recomputeDebtMock: vi.fn(),
  recordClientEventSafeMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma, Prisma: {} }));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

vi.mock("@/lib/manager/debt-register", () => ({
  recomputeDebtForClients: (...args: unknown[]) => recomputeDebtMock(...args),
}));

vi.mock("@/lib/manager/client-timeline", () => ({
  recordClientEventSafe: (...args: unknown[]) =>
    recordClientEventSafeMock(...args),
}));

import { POST } from "./route";

const OWNER_USER = {
  id: "u1",
  email: "alice@example.com",
  fullName: "Alice",
  role: "owner" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};

const MANAGER_USER = { ...OWNER_USER, id: "u2", role: "manager" as const };

function postReq(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/clients/c1/debt-correction",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const idParams = (): Promise<{ id: string }> => Promise.resolve({ id: "c1" });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(OWNER_USER);
  mockPrisma.mgrClient.findUnique
    .mockResolvedValueOnce({ id: "c1" }) // existence check
    .mockResolvedValue({ debt: 100 }); // updated debt read
  mockPrisma.mgrDebtMovement.create.mockResolvedValue({ id: "m1" });
  recomputeDebtMock.mockResolvedValue(1);
});

describe("POST /clients/[id]/debt-correction", () => {
  it("401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ amountEur: 50, direction: "increase" }), {
      params: idParams(),
    });
    expect(res.status).toBe(401);
    expect(mockPrisma.mgrDebtMovement.create).not.toHaveBeenCalled();
  });

  it("403 when role is not owner/admin (manager)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(MANAGER_USER);
    const res = await POST(postReq({ amountEur: 50, direction: "increase" }), {
      params: idParams(),
    });
    expect(res.status).toBe(403);
    expect(mockPrisma.mgrDebtMovement.create).not.toHaveBeenCalled();
  });

  it("400 when amount is 0", async () => {
    const res = await POST(postReq({ amountEur: 0, direction: "increase" }), {
      params: idParams(),
    });
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrDebtMovement.create).not.toHaveBeenCalled();
  });

  it("404 when client not found", async () => {
    mockPrisma.mgrClient.findUnique.mockReset();
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(null);
    const res = await POST(postReq({ amountEur: 50, direction: "increase" }), {
      params: idParams(),
    });
    expect(res.status).toBe(404);
    expect(mockPrisma.mgrDebtMovement.create).not.toHaveBeenCalled();
  });

  it("happy path increase → creates +movement, recomputes, returns debt", async () => {
    const res = await POST(
      postReq({ amountEur: 50, direction: "increase", note: "ручна" }),
      { params: idParams() },
    );
    expect(res.status).toBe(200);
    const call = (mockPrisma.mgrDebtMovement.create.mock.calls[0] ?? [])[0] as {
      data: { amountEur: number; kind: string; sourceType: string };
    };
    expect(call.data.amountEur).toBe(50);
    expect(call.data.kind).toBe("correction");
    expect(call.data.sourceType).toBe("manual");
    expect(recomputeDebtMock).toHaveBeenCalledWith(mockPrisma, ["c1"]);
    expect(recordClientEventSafeMock).toHaveBeenCalledTimes(1);
    const json = (await res.json()) as { debt: number };
    expect(json.debt).toBe(100);
  });

  it("happy path decrease → creates negative movement", async () => {
    const res = await POST(postReq({ amountEur: 30, direction: "decrease" }), {
      params: idParams(),
    });
    expect(res.status).toBe(200);
    const call = (mockPrisma.mgrDebtMovement.create.mock.calls[0] ?? [])[0] as {
      data: { amountEur: number };
    };
    expect(call.data.amountEur).toBe(-30);
  });
});
