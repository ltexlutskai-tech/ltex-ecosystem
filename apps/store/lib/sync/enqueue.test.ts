import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    mgrSyncJob: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import { buildClientUpdatePayload, enqueueClientUpdate } from "./enqueue";

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
