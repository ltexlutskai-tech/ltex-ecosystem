import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrClient: {
      findUnique: vi.fn(),
    },
  },
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

import { GET } from "./route";

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
  return new NextRequest(`http://localhost/api/v1/manager/clients/${id}`, {
    method: "GET",
  });
}

const fakeClient = {
  id: "c1",
  code1C: "000000001",
  uid1C: null,
  name: "Test Client",
  phonePrimary: "+380501112233",
  city: "Київ",
  region: "Київська",
  street: "Lesi",
  house: "10",
  novaPoshtaBranch: null,
  geolocation: null,
  websiteUrl: null,
  monthlyVolume: { toString: () => "100.00" },
  licenseExpiresAt: null,
  isOwn: false,
  notDirectInput: false,
  debt: { toString: () => "1234.56" },
  overdueDebt: { toString: () => "0" },
  daysSinceLastPurchase: 10,
  lastPurchaseAt: new Date("2026-05-01"),
  hasNewMessage: false,
  isViberLinked: false,
  dialogStatus: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2026-05-01"),
  lastSyncedAt: new Date("2026-05-10"),
  statusGeneral: { code: "active", label: "Активний", colorHex: "#16a34a" },
  statusOperational: null,
  searchChannel: { code: "google", label: "Google" },
  categoryTT: null,
  deliveryMethod: null,
  primaryRoute: null,
  primaryAssortment: null,
  tradePointName: "Магазин Київ #1",
  viberContact: "+380501112233",
  tovDebt: { toString: () => "200.00" },
  tovOverdueDebt: null,
  sessionRemainder: { toString: () => "0.00" },
  priceType: { code: "wholesale", label: "Оптові" },
  agent: { id: "u1", fullName: "Alice" },
  phones: [{ id: "p1", phone: "+380501112233", label: null, messenger: null }],
  messengers: [],
  warehouses: [],
  routes: [],
  assortmentItems: [],
  presentations: [
    {
      id: "pr1",
      productCode: "X1",
      productName: "X1",
      lastPresentedAt: new Date("2026-05-01"),
      notDirectInput: false,
    },
  ],
  bankAccounts: [
    {
      id: "b1",
      accountNumber: "UA213996220000026007012345678",
      bankName: "ПриватБанк",
      mfo: "305299",
      comment: null,
      isHidden: false,
    },
  ],
  timeline: [
    {
      id: "t1",
      kind: "comment",
      body: "Тест",
      occurredAt: new Date("2026-05-01"),
      author: { id: "u1", fullName: "Alice" },
      metadata: null,
    },
  ],
  assignments: [{ user: { id: "u1", fullName: "Alice" } }],
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
});

describe("GET /api/v1/manager/clients/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(makeReq("c1"), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when client not found", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(null);
    const res = await GET(makeReq("missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns full client detail with relations on happy path", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(fakeClient);
    const res = await GET(makeReq("c1"), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      client: {
        id: string;
        name: string;
        debt: string;
        phones: unknown[];
        timeline: unknown[];
        assignedManager: { id: string; fullName: string } | null;
      };
    };
    expect(json.client.id).toBe("c1");
    expect(json.client.name).toBe("Test Client");
    expect(json.client.debt).toBe("1234.56");
    expect(json.client.phones).toHaveLength(1);
    expect(json.client.timeline).toHaveLength(1);
    expect(json.client.assignedManager?.fullName).toBe("Alice");
  });

  it("returns new M1.3c fields (tradePointName, priceType, agent, presentations, bankAccounts)", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(fakeClient);
    const res = await GET(makeReq("c1"), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      client: {
        tradePointName: string | null;
        priceType: { code: string; label: string } | null;
        agent: { id: string; fullName: string } | null;
        tovDebt: string | null;
        sessionRemainder: string | null;
        viberContact: string | null;
        presentations: unknown[];
        bankAccounts: { accountNumber: string }[];
      };
    };
    expect(json.client.tradePointName).toBe("Магазин Київ #1");
    expect(json.client.priceType?.code).toBe("wholesale");
    expect(json.client.agent?.fullName).toBe("Alice");
    expect(json.client.tovDebt).toBe("200.00");
    expect(json.client.sessionRemainder).toBe("0.00");
    expect(json.client.viberContact).toBe("+380501112233");
    expect(json.client.presentations).toHaveLength(1);
    expect(json.client.bankAccounts[0]?.accountNumber).toBe(
      "UA213996220000026007012345678",
    );
  });
});
