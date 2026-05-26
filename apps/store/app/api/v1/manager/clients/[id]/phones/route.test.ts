import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, canEditClientMock } = vi.hoisted(
  () => ({
    mockPrisma: {
      mgrClient: { findUnique: vi.fn() },
      mgrClientPhone: {
        aggregate: vi.fn(),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
    getCurrentUserMock: vi.fn(),
    canEditClientMock: vi.fn(),
  }),
);

vi.mock("@ltex/db", () => ({ prisma: mockPrisma, Prisma: {} }));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

vi.mock("@/lib/permissions/mgr-client-edit", () => ({
  canEditClient: (...args: unknown[]) => canEditClientMock(...args),
}));

import { POST } from "./route";
import { PATCH, DELETE } from "./[phoneId]/route";

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

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/clients/c1/phones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchReq(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/clients/c1/phones/p9",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function deleteReq(): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/clients/c1/phones/p9",
    { method: "DELETE" },
  );
}

const idParams = (): Promise<{ id: string }> => Promise.resolve({ id: "c1" });
const phoneParams = (
  phoneId: string,
): Promise<{ id: string; phoneId: string }> =>
  Promise.resolve({ id: "c1", phoneId });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
  canEditClientMock.mockResolvedValue(true);
  mockPrisma.mgrClient.findUnique.mockResolvedValue({ id: "c1" });
  mockPrisma.mgrClientPhone.aggregate.mockResolvedValue({
    _max: { sortOrder: 2 },
  });
});

describe("POST /clients/[id]/phones", () => {
  it("401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ phone: "+380501112233" }), {
      params: idParams(),
    });
    expect(res.status).toBe(401);
  });

  it("403 when manager has no permission", async () => {
    canEditClientMock.mockResolvedValueOnce(false);
    const res = await POST(postReq({ phone: "+380501112233" }), {
      params: idParams(),
    });
    expect(res.status).toBe(403);
    expect(mockPrisma.mgrClientPhone.create).not.toHaveBeenCalled();
  });

  it("400 on empty phone", async () => {
    const res = await POST(postReq({ phone: "" }), {
      params: idParams(),
    });
    expect(res.status).toBe(400);
  });

  it("400 on invalid messenger value", async () => {
    const res = await POST(
      postReq({ phone: "+380501112233", messenger: "signal" }),
      { params: idParams() },
    );
    expect(res.status).toBe(400);
  });

  it("creates phone with sortOrder = max+1", async () => {
    mockPrisma.mgrClientPhone.create.mockResolvedValueOnce({
      id: "p10",
      phone: "+380501112233",
      label: null,
      messenger: "viber",
      sortOrder: 3,
    });
    const res = await POST(
      postReq({ phone: "+380501112233", messenger: "viber" }),
      { params: idParams() },
    );
    expect(res.status).toBe(201);
    const call = (mockPrisma.mgrClientPhone.create.mock.calls[0] ?? [])[0] as {
      data: { sortOrder: number; messenger: string | null };
    };
    expect(call.data.sortOrder).toBe(3);
    expect(call.data.messenger).toBe("viber");
    const json = (await res.json()) as { phone: { id: string } };
    expect(json.phone.id).toBe("p10");
  });

  it("404 when client not found", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(null);
    const res = await POST(postReq({ phone: "+380501112233" }), {
      params: idParams(),
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /clients/[id]/phones/[phoneId]", () => {
  beforeEach(() => {
    mockPrisma.mgrClientPhone.findUnique.mockResolvedValue({
      id: "p9",
      clientId: "c1",
    });
  });

  it("403 when no permission", async () => {
    canEditClientMock.mockResolvedValueOnce(false);
    const res = await PATCH(patchReq({ phone: "+380509998877" }), {
      params: phoneParams("p9"),
    });
    expect(res.status).toBe(403);
  });

  it("404 when phone belongs to another client", async () => {
    mockPrisma.mgrClientPhone.findUnique.mockResolvedValueOnce({
      id: "p9",
      clientId: "OTHER",
    });
    const res = await PATCH(patchReq({ phone: "+380509998877" }), {
      params: phoneParams("p9"),
    });
    expect(res.status).toBe(404);
    expect(mockPrisma.mgrClientPhone.update).not.toHaveBeenCalled();
  });

  it("updates phone + messenger", async () => {
    mockPrisma.mgrClientPhone.update.mockResolvedValueOnce({
      id: "p9",
      phone: "+380509998877",
      label: null,
      messenger: "telegram",
      sortOrder: 1,
    });
    const res = await PATCH(
      patchReq({ phone: "+380509998877", messenger: "telegram" }),
      { params: phoneParams("p9") },
    );
    expect(res.status).toBe(200);
    const call = (mockPrisma.mgrClientPhone.update.mock.calls[0] ?? [])[0] as {
      data: { phone?: string; messenger?: string | null };
    };
    expect(call.data.phone).toBe("+380509998877");
    expect(call.data.messenger).toBe("telegram");
  });

  it("400 on empty patch body", async () => {
    const res = await PATCH(patchReq({}), { params: phoneParams("p9") });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /clients/[id]/phones/[phoneId]", () => {
  beforeEach(() => {
    mockPrisma.mgrClientPhone.findUnique.mockResolvedValue({
      id: "p9",
      clientId: "c1",
    });
  });

  it("403 when no permission", async () => {
    canEditClientMock.mockResolvedValueOnce(false);
    const res = await DELETE(deleteReq(), { params: phoneParams("p9") });
    expect(res.status).toBe(403);
    expect(mockPrisma.mgrClientPhone.delete).not.toHaveBeenCalled();
  });

  it("404 when phone belongs to another client", async () => {
    mockPrisma.mgrClientPhone.findUnique.mockResolvedValueOnce({
      id: "p9",
      clientId: "OTHER",
    });
    const res = await DELETE(deleteReq(), { params: phoneParams("p9") });
    expect(res.status).toBe(404);
    expect(mockPrisma.mgrClientPhone.delete).not.toHaveBeenCalled();
  });

  it("deletes the phone on happy path", async () => {
    mockPrisma.mgrClientPhone.delete.mockResolvedValueOnce({ id: "p9" });
    const res = await DELETE(deleteReq(), { params: phoneParams("p9") });
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrClientPhone.delete).toHaveBeenCalledWith({
      where: { id: "p9" },
    });
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});
