import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    mgrSyncJob: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import {
  buildClientUpdatePayload,
  buildOrderCreatePayload,
  buildPaymentCreatePayload,
  enqueueClientUpdate,
  enqueueOrderCreate,
  enqueuePaymentCreate,
} from "./enqueue";

const baseClient = {
  id: "c1",
  code1C: "000005798",
  name: "Магазин Соборна",
  tradePointName: "ТТ-1",
  region: "Київська",
  city: "Київ",
  street: "Соборна",
  house: "12",
  novaPoshtaBranch: "5",
  websiteUrl: "https://example.com",
  geolocation: "50.45,30.52",
  monthlyVolume: { toString: () => "150.50" },
  licenseExpiresAt: new Date("2026-12-31T00:00:00.000Z"),
  viberContact: "+380501112233",
  dialogStatus: null,
  statusGeneral: { code: "active" },
  statusOperational: null,
  categoryTT: null,
  deliveryMethod: { code: "nova-poshta" },
  searchChannel: { code: "google" },
  primaryRoute: null,
  primaryAssortment: null,
  priceType: { code: "wholesale" },
  agent: { code1C: "U0001" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildClientUpdatePayload", () => {
  it("збирає повний payload з усіма FK кодами", () => {
    const payload = buildClientUpdatePayload(baseClient);
    expect(payload.code1C).toBe("000005798");
    expect(payload.name).toBe("Магазин Соборна");
    expect(payload.statusGeneralCode).toBe("active");
    expect(payload.deliveryMethodCode).toBe("nova-poshta");
    expect(payload.priceTypeCode).toBe("wholesale");
    expect(payload.agentCode1C).toBe("U0001");
  });

  it("Decimal monthlyVolume серіалізується як string", () => {
    const payload = buildClientUpdatePayload(baseClient);
    expect(payload.monthlyVolume).toBe("150.50");
    expect(typeof payload.monthlyVolume).toBe("string");
  });

  it("licenseExpiresAt серіалізується як ISO 8601 UTC string", () => {
    const payload = buildClientUpdatePayload(baseClient);
    expect(payload.licenseExpiresAt).toBe("2026-12-31T00:00:00.000Z");
  });

  it("null FK relations → null codes", () => {
    const payload = buildClientUpdatePayload(baseClient);
    expect(payload.statusOperationalCode).toBeNull();
    expect(payload.primaryAssortmentCode).toBeNull();
    expect(payload.categoryTTCode).toBeNull();
  });

  it("empty-string поля нормалізуються у null", () => {
    const payload = buildClientUpdatePayload({
      ...baseClient,
      tradePointName: "",
      websiteUrl: "",
    });
    expect(payload.tradePointName).toBeNull();
    expect(payload.websiteUrl).toBeNull();
  });

  it("null monthlyVolume і licenseExpiresAt → null strings", () => {
    const payload = buildClientUpdatePayload({
      ...baseClient,
      monthlyVolume: null,
      licenseExpiresAt: null,
    });
    expect(payload.monthlyVolume).toBeNull();
    expect(payload.licenseExpiresAt).toBeNull();
  });
});

describe("enqueueClientUpdate", () => {
  it("створює row з entityType='client' і default action='update'", async () => {
    mockPrisma.mgrSyncJob.create.mockResolvedValueOnce({ id: "j1" });
    await enqueueClientUpdate(baseClient);
    expect(mockPrisma.mgrSyncJob.create).toHaveBeenCalledOnce();
    const call = mockPrisma.mgrSyncJob.create.mock.calls[0]?.[0] as {
      data: {
        entityType: string;
        entityId: string;
        action: string;
        payload: { name: string };
        idempotencyKey: string;
        nextAttemptAt: Date;
      };
    };
    expect(call.data.entityType).toBe("client");
    expect(call.data.entityId).toBe("c1");
    expect(call.data.action).toBe("update");
    expect(call.data.payload.name).toBe("Магазин Соборна");
  });

  it("idempotencyKey — нова UUID на кожен виклик", async () => {
    mockPrisma.mgrSyncJob.create.mockResolvedValue({ id: "j" });
    await enqueueClientUpdate(baseClient);
    await enqueueClientUpdate(baseClient);
    const calls = mockPrisma.mgrSyncJob.create.mock.calls;
    const key1 = (calls[0]?.[0] as { data: { idempotencyKey: string } }).data
      .idempotencyKey;
    const key2 = (calls[1]?.[0] as { data: { idempotencyKey: string } }).data
      .idempotencyKey;
    expect(key1).not.toBe(key2);
    expect(key1).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("action='create' передається у data", async () => {
    mockPrisma.mgrSyncJob.create.mockResolvedValueOnce({ id: "j1" });
    await enqueueClientUpdate(baseClient, "create");
    const call = mockPrisma.mgrSyncJob.create.mock.calls[0]?.[0] as {
      data: { action: string };
    };
    expect(call.data.action).toBe("create");
  });

  it("nextAttemptAt — поточний момент (immediate retry by cron)", async () => {
    mockPrisma.mgrSyncJob.create.mockResolvedValueOnce({ id: "j1" });
    const before = Date.now();
    await enqueueClientUpdate(baseClient);
    const after = Date.now();
    const call = mockPrisma.mgrSyncJob.create.mock.calls[0]?.[0] as {
      data: { nextAttemptAt: Date };
    };
    expect(call.data.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(call.data.nextAttemptAt.getTime()).toBeLessThanOrEqual(after);
  });
});

// ─── M1.5b: Order + Payment enqueue ─────────────────────────────────────────

const baseOrder = {
  id: "ord1",
  code1C: null,
  status: "draft",
  totalEur: 125.5,
  totalUah: 5400.25,
  exchangeRate: 43.05,
  notes: "Терміново",
  customer: { code1C: "000005798" },
  items: [
    {
      productId: "p1",
      lotId: "l1",
      priceEur: 100.5,
      weight: 25.123,
      quantity: 1,
      product: { code1C: "0007854" },
      lot: { barcode: "1234567890123" },
    },
    {
      productId: "p2",
      lotId: null,
      priceEur: 25,
      weight: 5,
      quantity: 2,
      product: { code1C: "0007855" },
      lot: null,
    },
  ],
};

describe("buildOrderCreatePayload", () => {
  it("збирає payload з усіма items + Decimal-as-string + lot/general mix", () => {
    const payload = buildOrderCreatePayload(baseOrder);
    expect(payload.orderInternalId).toBe("ord1");
    expect(payload.customerCode1C).toBe("000005798");
    expect(payload.totalEur).toBe("125.50");
    expect(payload.totalUah).toBe("5400.25");
    expect(payload.exchangeRate).toBe("43.0500");
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0]?.lotBarcode).toBe("1234567890123");
    expect(payload.items[0]?.productCode1C).toBe("0007854");
    expect(payload.items[1]?.lotBarcode).toBeNull();
    expect(payload.items[1]?.lotId).toBeNull();
  });

  it("empty-string notes → null", () => {
    const payload = buildOrderCreatePayload({ ...baseOrder, notes: "" });
    expect(payload.notes).toBeNull();
  });

  it("numeric поля формуються як string з .2f / .3f / .4f", () => {
    const payload = buildOrderCreatePayload(baseOrder);
    expect(typeof payload.totalEur).toBe("string");
    expect(typeof payload.totalUah).toBe("string");
    expect(typeof payload.exchangeRate).toBe("string");
    expect(typeof payload.items[0]?.priceEur).toBe("string");
    expect(typeof payload.items[0]?.weight).toBe("string");
    expect(payload.items[0]?.weight).toBe("25.123");
  });
});

describe("enqueueOrderCreate", () => {
  it("створює row з entityType='order', action='create'", async () => {
    mockPrisma.mgrSyncJob.create.mockResolvedValueOnce({ id: "j1" });
    await enqueueOrderCreate(baseOrder);
    const call = mockPrisma.mgrSyncJob.create.mock.calls[0]?.[0] as {
      data: {
        entityType: string;
        entityId: string;
        action: string;
        idempotencyKey: string;
        payload: { customerCode1C: string };
      };
    };
    expect(call.data.entityType).toBe("order");
    expect(call.data.entityId).toBe("ord1");
    expect(call.data.action).toBe("create");
    expect(call.data.payload.customerCode1C).toBe("000005798");
    expect(call.data.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("idempotencyKey — нова UUID на кожен виклик", async () => {
    mockPrisma.mgrSyncJob.create.mockResolvedValue({ id: "j" });
    await enqueueOrderCreate(baseOrder);
    await enqueueOrderCreate(baseOrder);
    const calls = mockPrisma.mgrSyncJob.create.mock.calls;
    const key1 = (calls[0]?.[0] as { data: { idempotencyKey: string } }).data
      .idempotencyKey;
    const key2 = (calls[1]?.[0] as { data: { idempotencyKey: string } }).data
      .idempotencyKey;
    expect(key1).not.toBe(key2);
  });
});

const basePayment = {
  id: "pay1",
  orderId: "ord1",
  method: "cash",
  amount: 1500.0,
  currency: "UAH",
  externalId: null,
  paidAt: new Date("2026-05-15T10:00:00.000Z"),
  order: { code1C: "L-2026-0123" },
};

describe("buildPaymentCreatePayload", () => {
  it("збирає payload з orderCode1C + ISO paidAt", () => {
    const payload = buildPaymentCreatePayload(basePayment);
    expect(payload.paymentInternalId).toBe("pay1");
    expect(payload.orderCode1C).toBe("L-2026-0123");
    expect(payload.method).toBe("cash");
    expect(payload.amount).toBe("1500.00");
    expect(payload.paidAt).toBe("2026-05-15T10:00:00.000Z");
  });

  it("null paidAt + missing order.code1C → null", () => {
    const payload = buildPaymentCreatePayload({
      ...basePayment,
      paidAt: null,
      order: { code1C: null },
    });
    expect(payload.paidAt).toBeNull();
    expect(payload.orderCode1C).toBeNull();
  });
});

describe("enqueuePaymentCreate", () => {
  it("створює row з entityType='payment', action='create'", async () => {
    mockPrisma.mgrSyncJob.create.mockResolvedValueOnce({ id: "j2" });
    await enqueuePaymentCreate(basePayment);
    const call = mockPrisma.mgrSyncJob.create.mock.calls[0]?.[0] as {
      data: {
        entityType: string;
        entityId: string;
        action: string;
        payload: { orderCode1C: string };
      };
    };
    expect(call.data.entityType).toBe("payment");
    expect(call.data.entityId).toBe("pay1");
    expect(call.data.action).toBe("create");
    expect(call.data.payload.orderCode1C).toBe("L-2026-0123");
  });
});
