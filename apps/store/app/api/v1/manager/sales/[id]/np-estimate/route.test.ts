import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;
process.env.NP_SENDER_CITY_REF = "sender-city-ref";

const {
  mockPrisma,
  getCurrentUserMock,
  getDocumentPriceMock,
  getDocumentDeliveryDateMock,
} = vi.hoisted(() => ({
  mockPrisma: {
    sale: { findUnique: vi.fn() },
  },
  getCurrentUserMock: vi.fn(),
  getDocumentPriceMock: vi.fn(),
  getDocumentDeliveryDateMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUserMock(...a),
}));
vi.mock("@/lib/delivery/nova-poshta", () => ({
  getDocumentPrice: (...a: unknown[]) => getDocumentPriceMock(...a),
  getDocumentDeliveryDate: (...a: unknown[]) =>
    getDocumentDeliveryDateMock(...a),
}));

import { GET } from "./route";

const MANAGER = { id: "u1", role: "manager" as const };

function req(): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/sales/sale1/np-estimate",
  );
}
const params = Promise.resolve({ id: "sale1" });

/** Перший аргумент останнього виклику getDocumentPrice. */
function lastPriceArg(): Record<string, unknown> {
  const call = getDocumentPriceMock.mock.calls[0];
  if (!call) throw new Error("getDocumentPrice was not called");
  return call[0] as Record<string, unknown>;
}

function saleFixture(overrides: Record<string, unknown> = {}) {
  return {
    npCityRef: "recipient-city-ref",
    npDeliveryType: "WarehouseWarehouse",
    cashOnDelivery: false,
    codAmountUah: null,
    declaredValueUah: null,
    declaredValueEnabled: true,
    totalUah: 1500,
    items: [{ weight: 12 }, { weight: 8 }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NP_SENDER_CITY_REF = "sender-city-ref";
  getCurrentUserMock.mockResolvedValue(MANAGER);
  getDocumentPriceMock.mockResolvedValue({
    costUah: 120,
    redeliveryCostUah: 0,
  });
  getDocumentDeliveryDateMock.mockResolvedValue({
    deliveryDate: "2026-07-25",
  });
});

describe("GET /api/v1/manager/sales/[id]/np-estimate", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req(), { params });
    expect(res.status).toBe(401);
    expect(mockPrisma.sale.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when sale missing", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(null);
    const res = await GET(req(), { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 when no npCityRef", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(
      saleFixture({ npCityRef: null }),
    );
    const res = await GET(req(), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Нової Пошти/);
  });

  it("returns 400 when sender city not configured", async () => {
    delete process.env.NP_SENDER_CITY_REF;
    mockPrisma.sale.findUnique.mockResolvedValueOnce(saleFixture());
    const res = await GET(req(), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/NP_SENDER_CITY_REF/);
  });

  it("happy path returns costUah + deliveryDate", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(saleFixture());
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.costUah).toBe(120);
    expect(body.deliveryDate).toBe("2026-07-25");

    // weight = 12 + 8 = 20, serviceType = WarehouseWarehouse, cost = totalUah
    const priceArg = lastPriceArg();
    expect(priceArg.citySenderRef).toBe("sender-city-ref");
    expect(priceArg.cityRecipientRef).toBe("recipient-city-ref");
    expect(priceArg.weight).toBe(20);
    expect(priceArg.serviceType).toBe("WarehouseWarehouse");
    expect(priceArg.cost).toBe(1500);
    // No COD → no redelivery calculation.
    expect(priceArg.redeliveryCalculate).toBeUndefined();
  });

  it("passes redeliveryCalculate when COD is enabled", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(
      saleFixture({ cashOnDelivery: true, codAmountUah: 900 }),
    );
    getDocumentPriceMock.mockResolvedValueOnce({
      costUah: 130,
      redeliveryCostUah: 25,
    });
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.redeliveryCostUah).toBe(25);
    const priceArg = lastPriceArg();
    expect(priceArg.redeliveryCalculate).toBe(900);
  });

  it("uses declaredValueUah as cost when declared value enabled", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(
      saleFixture({ declaredValueEnabled: true, declaredValueUah: 3000 }),
    );
    await GET(req(), { params });
    const priceArg = lastPriceArg();
    expect(priceArg.cost).toBe(3000);
  });

  it("surfaces price error as ok:false", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(saleFixture());
    getDocumentPriceMock.mockResolvedValueOnce({
      error: "Не вдалося оцінити вартість",
    });
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/оцінити вартість/);
  });

  it("delivery date error is non-fatal (deliveryDate null)", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(saleFixture());
    getDocumentDeliveryDateMock.mockResolvedValueOnce({
      error: "Не вдалося оцінити дату",
    });
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.costUah).toBe(120);
    expect(body.deliveryDate).toBeNull();
  });
});
