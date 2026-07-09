import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, canEditClientMock } = vi.hoisted(
  () => ({
    mockPrisma: {
      mgrClient: { findUnique: vi.fn() },
      mgrClientContact: {
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
import { PATCH, DELETE } from "./[contactId]/route";

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
    "http://localhost/api/v1/manager/clients/c1/contacts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function patchReq(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/clients/c1/contacts/k9",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function deleteReq(): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/clients/c1/contacts/k9",
    { method: "DELETE" },
  );
}

const idParams = (): Promise<{ id: string }> => Promise.resolve({ id: "c1" });
const contactParams = (
  contactId: string,
): Promise<{ id: string; contactId: string }> =>
  Promise.resolve({ id: "c1", contactId });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
  canEditClientMock.mockResolvedValue(true);
  mockPrisma.mgrClient.findUnique.mockResolvedValue({ id: "c1" });
  mockPrisma.mgrClientContact.aggregate.mockResolvedValue({
    _max: { sortOrder: 1 },
  });
});

describe("POST /clients/[id]/contacts", () => {
  it("401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ fullName: "Іван" }), {
      params: idParams(),
    });
    expect(res.status).toBe(401);
  });

  it("403 when manager has no permission", async () => {
    canEditClientMock.mockResolvedValueOnce(false);
    const res = await POST(postReq({ fullName: "Іван" }), {
      params: idParams(),
    });
    expect(res.status).toBe(403);
    expect(mockPrisma.mgrClientContact.create).not.toHaveBeenCalled();
  });

  it("400 on empty fullName", async () => {
    const res = await POST(postReq({ fullName: "" }), { params: idParams() });
    expect(res.status).toBe(400);
  });

  it("creates contact with sortOrder = max+1", async () => {
    mockPrisma.mgrClientContact.create.mockResolvedValueOnce({
      id: "k2",
      fullName: "Іван Петренко",
      position: "Директор",
      phone: null,
      email: null,
      comment: null,
      sortOrder: 2,
    });
    const res = await POST(
      postReq({ fullName: "Іван Петренко", position: "Директор" }),
      { params: idParams() },
    );
    expect(res.status).toBe(201);
    const call = (mockPrisma.mgrClientContact.create.mock.calls[0] ??
      [])[0] as {
      data: { sortOrder: number; fullName: string };
    };
    expect(call.data.sortOrder).toBe(2);
    expect(call.data.fullName).toBe("Іван Петренко");
    const json = (await res.json()) as { contact: { id: string } };
    expect(json.contact.id).toBe("k2");
  });

  it("404 when client not found", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(null);
    const res = await POST(postReq({ fullName: "Іван" }), {
      params: idParams(),
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /clients/[id]/contacts/[contactId]", () => {
  beforeEach(() => {
    mockPrisma.mgrClientContact.findUnique.mockResolvedValue({
      id: "k9",
      clientId: "c1",
    });
  });

  it("403 when no permission", async () => {
    canEditClientMock.mockResolvedValueOnce(false);
    const res = await PATCH(patchReq({ fullName: "Новий" }), {
      params: contactParams("k9"),
    });
    expect(res.status).toBe(403);
  });

  it("404 when contact belongs to another client", async () => {
    mockPrisma.mgrClientContact.findUnique.mockResolvedValueOnce({
      id: "k9",
      clientId: "OTHER",
    });
    const res = await PATCH(patchReq({ fullName: "Новий" }), {
      params: contactParams("k9"),
    });
    expect(res.status).toBe(404);
    expect(mockPrisma.mgrClientContact.update).not.toHaveBeenCalled();
  });

  it("updates fullName + position", async () => {
    mockPrisma.mgrClientContact.update.mockResolvedValueOnce({
      id: "k9",
      fullName: "Оновлений",
      position: "Менеджер",
      phone: null,
      email: null,
      comment: null,
      sortOrder: 0,
    });
    const res = await PATCH(
      patchReq({ fullName: "Оновлений", position: "Менеджер" }),
      { params: contactParams("k9") },
    );
    expect(res.status).toBe(200);
    const call = (mockPrisma.mgrClientContact.update.mock.calls[0] ??
      [])[0] as {
      data: { fullName?: string; position?: string | null };
    };
    expect(call.data.fullName).toBe("Оновлений");
    expect(call.data.position).toBe("Менеджер");
  });

  it("400 on empty patch body", async () => {
    const res = await PATCH(patchReq({}), { params: contactParams("k9") });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /clients/[id]/contacts/[contactId]", () => {
  beforeEach(() => {
    mockPrisma.mgrClientContact.findUnique.mockResolvedValue({
      id: "k9",
      clientId: "c1",
    });
  });

  it("403 when no permission", async () => {
    canEditClientMock.mockResolvedValueOnce(false);
    const res = await DELETE(deleteReq(), { params: contactParams("k9") });
    expect(res.status).toBe(403);
    expect(mockPrisma.mgrClientContact.delete).not.toHaveBeenCalled();
  });

  it("404 when contact belongs to another client", async () => {
    mockPrisma.mgrClientContact.findUnique.mockResolvedValueOnce({
      id: "k9",
      clientId: "OTHER",
    });
    const res = await DELETE(deleteReq(), { params: contactParams("k9") });
    expect(res.status).toBe(404);
    expect(mockPrisma.mgrClientContact.delete).not.toHaveBeenCalled();
  });

  it("deletes the contact on happy path", async () => {
    mockPrisma.mgrClientContact.delete.mockResolvedValueOnce({ id: "k9" });
    const res = await DELETE(deleteReq(), { params: contactParams("k9") });
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrClientContact.delete).toHaveBeenCalledWith({
      where: { id: "k9" },
    });
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});
