import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    mgrSyncJob: {
      create: vi.fn(),
    },
    routeSheet: { findUnique: vi.fn() },
    sale: { findMany: vi.fn() },
    mgrCashOrder: { findMany: vi.fn() },
    order: { findMany: vi.fn() },
    customer: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
    lot: { findMany: vi.fn() },
    mgrClient: { findMany: vi.fn() },
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma, Prisma: {} }));

import {
  buildClientUpdatePayload,
  buildOrderCreatePayload,
  buildPaymentCreatePayload,
  buildRouteSheetCreatePayload,
  buildSaleCreatePayload,
  enqueueClientUpdate,
  enqueueOrderCreate,
  enqueuePaymentCreate,
  enqueueRouteSheetCreate,
  enqueueSaleCreate,
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

// ─── M1.6 (Реалізація, Етап 5): Sale enqueue ────────────────────────────────

const baseSale = {
  id: "sale1",
  code1C: null,
  docNumber: 42,
  totalEur: 150.5,
  totalUah: 6471.5,
  exchangeRateEur: 43.0,
  exchangeRateUsd: 39.85,
  priceTypeId: "pt-retail",
  deliveryMethod: "post",
  novaPoshtaBranch: "7",
  cashOnDelivery: true,
  codAmountUah: 6471,
  assignedAgentUserId: "mgr-9",
  onTradeAgent: false,
  expressWaybill: "TTN-001",
  notes: "Відвантажено",
  customer: { code1C: "000005798", name: "Магазин Соборна" },
  items: [
    {
      productId: "p1",
      lotId: "l1",
      pricePerKg: 4.05,
      weight: 25.123,
      quantity: 1,
      priceEur: 100.5,
      product: { code1C: "0007854" },
      lot: { barcode: "1234567890123" },
    },
    {
      productId: "p2",
      lotId: null,
      pricePerKg: 5,
      weight: 10,
      quantity: 2,
      priceEur: 50,
      product: { code1C: "0007855" },
      lot: null,
    },
  ],
};

describe("buildSaleCreatePayload", () => {
  it("збирає payload з усіма items + manager-полями + lot/general mix", () => {
    const payload = buildSaleCreatePayload(baseSale);
    expect(payload.saleInternalId).toBe("sale1");
    expect(payload.docNumber).toBe(42);
    expect(payload.customerCode1C).toBe("000005798");
    expect(payload.customerName).toBe("Магазин Соборна");
    expect(payload.deliveryMethod).toBe("post");
    expect(payload.novaPoshtaBranch).toBe("7");
    expect(payload.cashOnDelivery).toBe(true);
    expect(payload.onTradeAgent).toBe(false);
    expect(payload.expressWaybill).toBe("TTN-001");
    expect(payload.priceTypeId).toBe("pt-retail");
    expect(payload.assignedAgentUserId).toBe("mgr-9");
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0]?.lotBarcode).toBe("1234567890123");
    expect(payload.items[0]?.productCode1C).toBe("0007854");
    expect(payload.items[1]?.lotBarcode).toBeNull();
    expect(payload.items[1]?.lotId).toBeNull();
  });

  it("numeric поля формуються як string з .2f / .3f / .4f", () => {
    const payload = buildSaleCreatePayload(baseSale);
    expect(payload.totalEur).toBe("150.50");
    expect(payload.totalUah).toBe("6471.50");
    expect(payload.exchangeRateEur).toBe("43.0000");
    expect(payload.exchangeRateUsd).toBe("39.8500");
    expect(payload.codAmountUah).toBe("6471.00");
    expect(payload.items[0]?.pricePerKg).toBe("4.05");
    expect(payload.items[0]?.priceEur).toBe("100.50");
    expect(payload.items[0]?.weight).toBe("25.123");
    expect(typeof payload.totalEur).toBe("string");
  });

  it("codAmountUah → null коли наложки немає", () => {
    const payload = buildSaleCreatePayload({
      ...baseSale,
      cashOnDelivery: false,
      codAmountUah: null,
    });
    expect(payload.codAmountUah).toBeNull();
    expect(payload.cashOnDelivery).toBe(false);
  });

  it("empty/optional поля нормалізуються у null", () => {
    const payload = buildSaleCreatePayload({
      ...baseSale,
      notes: "",
      expressWaybill: "",
      novaPoshtaBranch: null,
      priceTypeId: null,
      assignedAgentUserId: null,
    });
    expect(payload.notes).toBeNull();
    expect(payload.expressWaybill).toBeNull();
    expect(payload.novaPoshtaBranch).toBeNull();
    expect(payload.priceTypeId).toBeNull();
    expect(payload.assignedAgentUserId).toBeNull();
  });
});

describe("enqueueSaleCreate", () => {
  it("створює row з entityType='realization', action='create'", async () => {
    mockPrisma.mgrSyncJob.create.mockResolvedValueOnce({ id: "j3" });
    await enqueueSaleCreate(baseSale);
    const call = mockPrisma.mgrSyncJob.create.mock.calls[0]?.[0] as {
      data: {
        entityType: string;
        entityId: string;
        action: string;
        idempotencyKey: string;
        payload: { customerCode1C: string };
      };
    };
    expect(call.data.entityType).toBe("realization");
    expect(call.data.entityId).toBe("sale1");
    expect(call.data.action).toBe("create");
    expect(call.data.payload.customerCode1C).toBe("000005798");
    expect(call.data.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("idempotencyKey — нова UUID на кожен виклик", async () => {
    mockPrisma.mgrSyncJob.create.mockResolvedValue({ id: "j" });
    await enqueueSaleCreate(baseSale);
    await enqueueSaleCreate(baseSale);
    const calls = mockPrisma.mgrSyncJob.create.mock.calls;
    const key1 = (calls[0]?.[0] as { data: { idempotencyKey: string } }).data
      .idempotencyKey;
    const key2 = (calls[1]?.[0] as { data: { idempotencyKey: string } }).data
      .idempotencyKey;
    expect(key1).not.toBe(key2);
  });
});

// ─── M1.9 (Маршрутний лист, Етап 5): RouteSheet enqueue ─────────────────────

describe("buildRouteSheetCreatePayload", () => {
  const baseInput = {
    sheet: {
      id: "rs1",
      code1C: null,
      docNumber: 7,
      date: new Date("2026-05-25T08:00:00.000Z"),
      arrivalDate: new Date("2026-05-25T09:30:00.000Z"),
      status: "dispatched",
      comment: "Виїзд по Луцьку",
      mileageStartKm: 1200.5,
      mileageEndKm: null,
      gpsLat: 50.748,
      gpsLng: 25.325,
    },
    routeCode1C: "RT-001",
    expeditorCode1C: "U0001",
    orders: [{ orderCode1C: "ORD-7", customerCode1C: "000001", city: "Луцьк" }],
    items: [
      {
        orderCode1C: "ORD-7",
        customerCode1C: "000001",
        productCode1C: "0007854",
        lotBarcode: "1234567890123",
        unit: null,
        quantity: 2,
        quantityLoaded: 1,
        price: 80.5,
        sum: 161,
      },
    ],
    loading: [
      {
        orderCode1C: "ORD-7",
        customerCode1C: "000001",
        productCode1C: "0007854",
        lotBarcode: "1234567890123",
        unit: null,
        quantity: 1,
        weight: 20.123,
        price: 80.5,
        sum: 80.5,
        pricePerKg: 4.0,
        loaded: true,
        isReturn: false,
      },
    ],
    sales: [
      {
        saleCode1C: "0000456",
        orderCode1C: "ORD-7",
        customerCode1C: "000001",
        sum: 150.5,
      },
    ],
    payments: [
      {
        cashOrderCode1C: "0000017",
        saleCode1C: "0000456",
        customerCode1C: "000001",
        type: "income",
        amount: 100,
      },
    ],
    tasks: [{ customerCode1C: "000002", comment: "Подзвонити" }],
  };

  it("збирає header + усі таб. частини з бізнес-ключами", () => {
    const payload = buildRouteSheetCreatePayload(baseInput);
    expect(payload.routeSheetInternalId).toBe("rs1");
    expect(payload.docNumber).toBe(7);
    expect(payload.status).toBe("dispatched");
    expect(payload.routeCode1C).toBe("RT-001");
    expect(payload.expeditorCode1C).toBe("U0001");
    expect(payload.date).toBe("2026-05-25T08:00:00.000Z");
    expect(payload.arrivalDate).toBe("2026-05-25T09:30:00.000Z");
    expect(payload.orders).toHaveLength(1);
    expect(payload.orders[0]?.orderCode1C).toBe("ORD-7");
    expect(payload.orders[0]?.city).toBe("Луцьк");
    expect(payload.items[0]?.productCode1C).toBe("0007854");
    expect(payload.items[0]?.lotBarcode).toBe("1234567890123");
    expect(payload.items[0]?.quantityLoaded).toBe(1);
    expect(payload.loading[0]?.isReturn).toBe(false);
    expect(payload.sales[0]?.saleCode1C).toBe("0000456");
    expect(payload.payments[0]?.cashOrderCode1C).toBe("0000017");
    expect(payload.payments[0]?.type).toBe("income");
    expect(payload.tasks[0]?.comment).toBe("Подзвонити");
  });

  it("numeric поля формуються як string (mileage .1f / gps .6f / sums .2f / weight .3f)", () => {
    const payload = buildRouteSheetCreatePayload(baseInput);
    expect(payload.mileageStartKm).toBe("1200.5");
    expect(payload.mileageEndKm).toBeNull();
    expect(payload.gpsLat).toBe("50.748000");
    expect(payload.gpsLng).toBe("25.325000");
    expect(payload.items[0]?.price).toBe("80.50");
    expect(payload.items[0]?.sum).toBe("161.00");
    expect(payload.loading[0]?.weight).toBe("20.123");
    expect(payload.loading[0]?.pricePerKg).toBe("4.00");
    expect(payload.sales[0]?.sum).toBe("150.50");
    expect(payload.payments[0]?.amount).toBe("100.00");
    expect(typeof payload.items[0]?.price).toBe("string");
  });

  it("null arrivalDate / gps / mileage → null", () => {
    const payload = buildRouteSheetCreatePayload({
      ...baseInput,
      sheet: {
        ...baseInput.sheet,
        arrivalDate: null,
        gpsLat: null,
        gpsLng: null,
        mileageStartKm: null,
        comment: "",
      },
    });
    expect(payload.arrivalDate).toBeNull();
    expect(payload.gpsLat).toBeNull();
    expect(payload.gpsLng).toBeNull();
    expect(payload.mileageStartKm).toBeNull();
    expect(payload.comment).toBeNull();
  });
});

describe("enqueueRouteSheetCreate", () => {
  beforeEach(() => {
    mockPrisma.routeSheet.findUnique.mockReset();
    mockPrisma.sale.findMany.mockResolvedValue([]);
    mockPrisma.mgrCashOrder.findMany.mockResolvedValue([]);
    mockPrisma.order.findMany.mockResolvedValue([]);
    mockPrisma.customer.findMany.mockResolvedValue([]);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.lot.findMany.mockResolvedValue([]);
    mockPrisma.mgrClient.findMany.mockResolvedValue([]);
  });

  const fakeSheet = {
    id: "rs1",
    code1C: null,
    docNumber: 7,
    date: new Date("2026-05-25T08:00:00.000Z"),
    arrivalDate: null,
    status: "dispatched",
    comment: null,
    mileageStartKm: null,
    mileageEndKm: null,
    gpsLat: null,
    gpsLng: null,
    route: { code1C: "RT-001" },
    expeditor: { code1C: "U0001" },
    orders: [{ orderId: "o1", customerId: "c1", city: "Луцьк" }],
    items: [
      {
        orderId: "o1",
        customerId: "c1",
        productId: "p1",
        lotId: "l1",
        unit: null,
        quantity: 2,
        quantityLoaded: 1,
        price: 80.5,
        sum: 161,
      },
    ],
    loading: [
      {
        orderId: "o1",
        customerId: "c1",
        productId: "p1",
        lotId: "l1",
        barcode: "1234567890123",
        unit: null,
        quantity: 1,
        weight: 20,
        price: 80.5,
        sum: 80.5,
        pricePerKg: 4.0,
        loaded: true,
        isReturn: false,
      },
    ],
    tasks: [{ customerId: "mc1", comment: "Подзвонити" }],
  };

  it("створює row з entityType='route_sheet', action='create' + резолвить code1C", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce(fakeSheet);
    mockPrisma.sale.findMany.mockResolvedValueOnce([
      {
        code1C: "0000456",
        orderId: "o1",
        totalEur: 150.5,
        customer: { code1C: "000001" },
      },
    ]);
    mockPrisma.mgrCashOrder.findMany.mockResolvedValueOnce([
      {
        code1C: "0000017",
        type: "income",
        documentSumEur: 100,
        saleId: "s1",
        customer: { code1C: "000001" },
        sale: { code1C: "0000456", customer: { code1C: "000001" } },
      },
    ]);
    mockPrisma.order.findMany.mockResolvedValueOnce([
      { id: "o1", code1C: "ORD-7" },
    ]);
    mockPrisma.customer.findMany.mockResolvedValueOnce([
      { id: "c1", code1C: "000001" },
    ]);
    mockPrisma.product.findMany.mockResolvedValueOnce([
      { id: "p1", code1C: "0007854" },
    ]);
    mockPrisma.lot.findMany.mockResolvedValueOnce([
      { id: "l1", barcode: "1234567890123" },
    ]);
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([
      { id: "mc1", code1C: "000002" },
    ]);
    mockPrisma.mgrSyncJob.create.mockResolvedValueOnce({ id: "j-rsh" });

    await enqueueRouteSheetCreate("rs1");

    const call = mockPrisma.mgrSyncJob.create.mock.calls[0]?.[0] as {
      data: {
        entityType: string;
        entityId: string;
        action: string;
        idempotencyKey: string;
        payload: {
          routeCode1C: string;
          expeditorCode1C: string;
          orders: Array<{ orderCode1C: string; customerCode1C: string }>;
          items: Array<{ productCode1C: string; lotBarcode: string }>;
          sales: Array<{ saleCode1C: string }>;
          payments: Array<{ cashOrderCode1C: string }>;
          tasks: Array<{ customerCode1C: string }>;
        };
      };
    };
    expect(call.data.entityType).toBe("route_sheet");
    expect(call.data.entityId).toBe("rs1");
    expect(call.data.action).toBe("create");
    expect(call.data.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(call.data.payload.routeCode1C).toBe("RT-001");
    expect(call.data.payload.expeditorCode1C).toBe("U0001");
    expect(call.data.payload.orders[0]?.orderCode1C).toBe("ORD-7");
    expect(call.data.payload.orders[0]?.customerCode1C).toBe("000001");
    expect(call.data.payload.items[0]?.productCode1C).toBe("0007854");
    expect(call.data.payload.items[0]?.lotBarcode).toBe("1234567890123");
    expect(call.data.payload.sales[0]?.saleCode1C).toBe("0000456");
    expect(call.data.payload.payments[0]?.cashOrderCode1C).toBe("0000017");
    expect(call.data.payload.tasks[0]?.customerCode1C).toBe("000002");
  });

  it("no-op коли МЛ не знайдено (null, без enqueue)", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce(null);
    const result = await enqueueRouteSheetCreate("missing");
    expect(result).toBeNull();
    expect(mockPrisma.mgrSyncJob.create).not.toHaveBeenCalled();
  });
});
