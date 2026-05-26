import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, canEditClientMock } = vi.hoisted(
  () => ({
    mockPrisma: {
      mgrClient: { findUnique: vi.fn() },
      mgrClientMessenger: {
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
import { PATCH, DELETE } from "./[messengerId]/route";

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
  return new NextRequest(
    "http://localhost/api/v1/manager/clients/c1/messengers",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function patchReq(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/clients/c1/messengers/m9",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function deleteReq(): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/clients/c1/messengers/m9",
    { method: "DELETE" },
  );
}

const idParams = (): Promise<{ id: string }> => Promise.resolve({ id: "c1" });
const msgParams = (
  messengerId: string,
): Promise<{ id: string; messengerId: string }> =>
  Promise.resolve({ id: "c1", messengerId });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
  canEditClientMock.mockResolvedValue(true);
  mockPrisma.mgrClient.findUnique.mockResolvedValue({ id: "c1" });
});

describe("POST /clients/[id]/messengers", () => {
  it("401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ network: "telegram", handle: "ltex" }), {
      params: idParams(),
    });
    expect(res.status).toBe(401);
  });

  it("403 when manager has no permission", async () => {
    canEditClientMock.mockResolvedValueOnce(false);
    const res = await POST(postReq({ network: "telegram", handle: "ltex" }), {
      params: idParams(),
    });
    expect(res.status).toBe(403);
    expect(mockPrisma.mgrClientMessenger.create).not.toHaveBeenCalled();
  });

  it("400 on unknown network", async () => {
    const res = await POST(postReq({ network: "signal", handle: "ltex" }), {
      params: idParams(),
    });
    expect(res.status).toBe(400);
  });

  it("400 when neither handle nor url provided", async () => {
    const res = await POST(postReq({ network: "telegram" }), {
      params: idParams(),
    });
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrClientMessenger.create).not.toHaveBeenCalled();
  });

  it("404 when client not found", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(null);
    const res = await POST(postReq({ network: "telegram", handle: "ltex" }), {
      params: idParams(),
    });
    expect(res.status).toBe(404);
  });

  it("creates messenger on happy path", async () => {
    mockPrisma.mgrClientMessenger.create.mockResolvedValueOnce({
      id: "m10",
      network: "telegram",
      handle: "ltex",
      url: null,
      browserUrl: null,
      comment: null,
    });
    const res = await POST(postReq({ network: "telegram", handle: "@ltex" }), {
      params: idParams(),
    });
    expect(res.status).toBe(201);
    const call = (mockPrisma.mgrClientMessenger.create.mock.calls[0] ??
      [])[0] as { data: { network: string; handle: string } };
    expect(call.data.network).toBe("telegram");
    expect(call.data.handle).toBe("@ltex");
    const json = (await res.json()) as { messenger: { id: string } };
    expect(json.messenger.id).toBe("m10");
  });

  it("accepts url-only entry (no handle)", async () => {
    mockPrisma.mgrClientMessenger.create.mockResolvedValueOnce({
      id: "m11",
      network: "facebook",
      handle: "",
      url: "https://fb.com/ltex",
      browserUrl: null,
      comment: null,
    });
    const res = await POST(
      postReq({ network: "facebook", url: "https://fb.com/ltex" }),
      { params: idParams() },
    );
    expect(res.status).toBe(201);
    const call = (mockPrisma.mgrClientMessenger.create.mock.calls[0] ??
      [])[0] as { data: { handle: string; url: string | null } };
    expect(call.data.handle).toBe("");
    expect(call.data.url).toBe("https://fb.com/ltex");
  });
});

describe("PATCH /clients/[id]/messengers/[messengerId]", () => {
  beforeEach(() => {
    mockPrisma.mgrClientMessenger.findUnique.mockResolvedValue({
      id: "m9",
      clientId: "c1",
    });
  });

  it("403 when no permission", async () => {
    canEditClientMock.mockResolvedValueOnce(false);
    const res = await PATCH(patchReq({ handle: "new" }), {
      params: msgParams("m9"),
    });
    expect(res.status).toBe(403);
  });

  it("404 when messenger belongs to another client", async () => {
    mockPrisma.mgrClientMessenger.findUnique.mockResolvedValueOnce({
      id: "m9",
      clientId: "OTHER",
    });
    const res = await PATCH(patchReq({ handle: "new" }), {
      params: msgParams("m9"),
    });
    expect(res.status).toBe(404);
    expect(mockPrisma.mgrClientMessenger.update).not.toHaveBeenCalled();
  });

  it("400 on empty patch body", async () => {
    const res = await PATCH(patchReq({}), { params: msgParams("m9") });
    expect(res.status).toBe(400);
  });

  it("updates network + handle", async () => {
    mockPrisma.mgrClientMessenger.update.mockResolvedValueOnce({
      id: "m9",
      network: "instagram",
      handle: "ltex_ua",
      url: null,
      browserUrl: null,
      comment: null,
    });
    const res = await PATCH(
      patchReq({ network: "instagram", handle: "ltex_ua" }),
      { params: msgParams("m9") },
    );
    expect(res.status).toBe(200);
    const call = (mockPrisma.mgrClientMessenger.update.mock.calls[0] ??
      [])[0] as { data: { network?: string; handle?: string } };
    expect(call.data.network).toBe("instagram");
    expect(call.data.handle).toBe("ltex_ua");
  });
});

describe("DELETE /clients/[id]/messengers/[messengerId]", () => {
  beforeEach(() => {
    mockPrisma.mgrClientMessenger.findUnique.mockResolvedValue({
      id: "m9",
      clientId: "c1",
    });
  });

  it("403 when no permission", async () => {
    canEditClientMock.mockResolvedValueOnce(false);
    const res = await DELETE(deleteReq(), { params: msgParams("m9") });
    expect(res.status).toBe(403);
    expect(mockPrisma.mgrClientMessenger.delete).not.toHaveBeenCalled();
  });

  it("404 when messenger belongs to another client", async () => {
    mockPrisma.mgrClientMessenger.findUnique.mockResolvedValueOnce({
      id: "m9",
      clientId: "OTHER",
    });
    const res = await DELETE(deleteReq(), { params: msgParams("m9") });
    expect(res.status).toBe(404);
    expect(mockPrisma.mgrClientMessenger.delete).not.toHaveBeenCalled();
  });

  it("deletes the messenger on happy path", async () => {
    mockPrisma.mgrClientMessenger.delete.mockResolvedValueOnce({ id: "m9" });
    const res = await DELETE(deleteReq(), { params: msgParams("m9") });
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrClientMessenger.delete).toHaveBeenCalledWith({
      where: { id: "m9" },
    });
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});
