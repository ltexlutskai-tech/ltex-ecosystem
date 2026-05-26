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
          product: {
            id: "p1",
            name: "Куртки",
            slug: "kurtky",
            articleCode: "AB-1",
            description: "Опис",
            videoUrl: null,
            createdAt: new Date("2026-04-01"),
            prices: [{ priceType: "wholesale", amount: 10 }],
          },
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
      mgrClient: { findUnique: vi.fn() },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
      __tx: tx,
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
  status: "free",
  priceEur: 100,
  videoUrl: null,
  isTarget: false,
  arrivalDate: new Date("2026-05-01"),
  sector: "A-1",
  isOpen: false,
  comment: null,
  description: null,
  videoDate: null,
  reservedForClientId: null,
  reservedForName: null,
  reservedByUserId: null,
  reservedByName: null,
  reservedUntil: null,
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

function futureIso(days = 7): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function makeReq(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/v1/manager/lots/${id}/book`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  txState.lotUpdateData = null;
  txState.timelineData = null;
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
  mockPrisma.lot.findUnique.mockResolvedValue(baseLot);
  mockPrisma.mgrClient.findUnique.mockResolvedValue({
    id: "c1",
    name: "ТОВ Ромашка",
  });
});

describe("POST /api/v1/manager/lots/[id]/book", () => {
  it("401 коли не авторизовано", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(
      makeReq("lot1", { clientId: "c1", until: futureIso() }),
      {
        params: Promise.resolve({ id: "lot1" }),
      },
    );
    expect(res.status).toBe(401);
  });

  it("400 коли невалідне тіло (нема clientId)", async () => {
    const res = await POST(makeReq("lot1", { until: futureIso() }), {
      params: Promise.resolve({ id: "lot1" }),
    });
    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("400 коли дата в минулому", async () => {
    const res = await POST(
      makeReq("lot1", { clientId: "c1", until: "2020-01-01T00:00:00.000Z" }),
      { params: Promise.resolve({ id: "lot1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("404 коли лот не знайдено", async () => {
    mockPrisma.lot.findUnique.mockResolvedValueOnce(null);
    const res = await POST(
      makeReq("nope", { clientId: "c1", until: futureIso() }),
      {
        params: Promise.resolve({ id: "nope" }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("409 коли лот зайнятий чужою активною бронню", async () => {
    mockPrisma.lot.findUnique.mockResolvedValueOnce({
      ...baseLot,
      status: "reserved",
      reservedByUserId: "u2",
      reservedForName: "Інший",
      reservedUntil: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    const res = await POST(
      makeReq("lot1", { clientId: "c1", until: futureIso() }),
      {
        params: Promise.resolve({ id: "lot1" }),
      },
    );
    expect(res.status).toBe(409);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("404 коли клієнта не знайдено", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(null);
    const res = await POST(
      makeReq("lot1", { clientId: "cX", until: futureIso() }),
      {
        params: Promise.resolve({ id: "lot1" }),
      },
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("happy path: пише reserved* + status=reserved + timeline-запис", async () => {
    const res = await POST(
      makeReq("lot1", { clientId: "c1", until: futureIso() }),
      {
        params: Promise.resolve({ id: "lot1" }),
      },
    );
    expect(res.status).toBe(200);
    expect(txState.lotUpdateData).toMatchObject({
      status: "reserved",
      reservedForClientId: "c1",
      reservedForName: "ТОВ Ромашка",
      reservedByUserId: "u1",
      reservedByName: "Alice",
    });
    expect(txState.lotUpdateData?.reservedUntil).toBeInstanceOf(Date);
    expect(txState.timelineData).toMatchObject({
      clientId: "c1",
      kind: "bron",
      authorUserId: "u1",
    });
    expect(String(txState.timelineData?.body)).toContain("1234567890123");
  });

  it("дозволяє перебронювати лот з протермінованою бронню", async () => {
    mockPrisma.lot.findUnique.mockResolvedValueOnce({
      ...baseLot,
      status: "reserved",
      reservedByUserId: "u2",
      reservedForName: "Старий",
      reservedUntil: new Date("2026-05-10T00:00:00.000Z"),
    });
    const res = await POST(
      makeReq("lot1", { clientId: "c1", until: futureIso() }),
      {
        params: Promise.resolve({ id: "lot1" }),
      },
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});
