import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, txState } = vi.hoisted(() => {
  const txState = {
    lotUpdateData: null as Record<string, unknown> | null,
    timelineData: null as Record<string, unknown> | null,
  };
  const tx = {
    lot: {
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        txState.lotUpdateData = args.data;
        return {
          ...baseLot,
          ...args.data,
          product: { id: "p1", name: "Куртки", slug: "kurtky" },
          barcodes: [{ id: "bc1", code: baseLot.barcode, type: "EAN13" }],
        };
      }),
    },
    mgrClientTimelineEntry: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        txState.timelineData = args.data;
        return { id: "t1" };
      }),
    },
  };
  return {
    txState,
    mockPrisma: {
      lot: { findUnique: vi.fn() },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    },
    getCurrentUserMock: vi.fn(),
  };
});

const baseLot = {
  id: "lot1",
  productId: "p1",
  barcode: "1234567890123",
  weight: 25,
  quantity: 1,
  status: "reserved",
  priceEur: 100,
  videoUrl: null,
  isTarget: false,
  arrivalDate: new Date("2026-05-01"),
  sector: "A-1",
  isOpen: false,
  comment: null,
  description: null,
  videoDate: null,
  reservedForClientId: "c1",
  reservedForName: "ТОВ Ромашка",
  reservedByUserId: "u1",
  reservedByName: "Alice",
  reservedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  createdAt: new Date("2026-04-01"),
  updatedAt: new Date("2026-05-01"),
};

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: {},
}));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

import { POST } from "./route";

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

function makeReq(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/v1/manager/lots/${id}/unbook`, {
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  txState.lotUpdateData = null;
  txState.timelineData = null;
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
  mockPrisma.lot.findUnique.mockResolvedValue(baseLot);
});

describe("POST /api/v1/manager/lots/[id]/unbook", () => {
  it("401 коли не авторизовано", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(makeReq("lot1"), {
      params: Promise.resolve({ id: "lot1" }),
    });
    expect(res.status).toBe(401);
  });

  it("404 коли лот не знайдено", async () => {
    mockPrisma.lot.findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeReq("nope"), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(404);
  });

  it("403 коли намагається зняти ЧУЖУ активну бронь", async () => {
    mockPrisma.lot.findUnique.mockResolvedValueOnce({
      ...baseLot,
      reservedByUserId: "u2",
    });
    const res = await POST(makeReq("lot1"), {
      params: Promise.resolve({ id: "lot1" }),
    });
    expect(res.status).toBe(403);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("403 коли лот вільний (нічого знімати)", async () => {
    mockPrisma.lot.findUnique.mockResolvedValueOnce({
      ...baseLot,
      status: "free",
      reservedByUserId: null,
      reservedForClientId: null,
      reservedForName: null,
      reservedUntil: null,
    });
    const res = await POST(makeReq("lot1"), {
      params: Promise.resolve({ id: "lot1" }),
    });
    expect(res.status).toBe(403);
  });

  it("happy path: очищає reserved* + status=free + timeline-запис", async () => {
    const res = await POST(makeReq("lot1"), {
      params: Promise.resolve({ id: "lot1" }),
    });
    expect(res.status).toBe(200);
    expect(txState.lotUpdateData).toMatchObject({
      status: "free",
      reservedForClientId: null,
      reservedForName: null,
      reservedByUserId: null,
      reservedByName: null,
      reservedUntil: null,
    });
    expect(txState.timelineData).toMatchObject({
      clientId: "c1",
      kind: "lot_booking",
      authorUserId: "u1",
    });
    expect(String(txState.timelineData?.body)).toContain("Знято бронь");
  });
});
