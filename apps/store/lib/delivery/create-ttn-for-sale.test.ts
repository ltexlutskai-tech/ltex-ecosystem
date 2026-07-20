import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  sale: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  category: { findMany: vi.fn() },
  warehouseTask: { updateMany: vi.fn() },
  createInternetDocument: vi.fn(),
  updateInternetDocument: vi.fn(),
  ensureRecipientPrivatePerson: vi.fn(),
  getSenderCounterparty: vi.fn(),
  getSenderContact: vi.fn(),
  getDeliveryLabelResolver: vi.fn(),
}));

vi.mock("@ltex/db", () => ({
  prisma: {
    sale: h.sale,
    category: h.category,
    warehouseTask: h.warehouseTask,
  },
}));
vi.mock("@/lib/delivery/nova-poshta", () => ({
  createInternetDocument: (...a: unknown[]) => h.createInternetDocument(...a),
  updateInternetDocument: (...a: unknown[]) => h.updateInternetDocument(...a),
  ensureRecipientPrivatePerson: (...a: unknown[]) =>
    h.ensureRecipientPrivatePerson(...a),
  getSenderCounterparty: (...a: unknown[]) => h.getSenderCounterparty(...a),
  getSenderContact: (...a: unknown[]) => h.getSenderContact(...a),
}));
vi.mock("@/lib/manager/delivery-methods", () => ({
  getDeliveryLabelResolver: (...a: unknown[]) =>
    h.getDeliveryLabelResolver(...a),
}));

import {
  createTtnForSale,
  updateTtnForSale,
  splitRecipientName,
} from "./create-ttn-for-sale";

function baseSale(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    ttnRef: null,
    deliveryMethod: "post",
    npCityRef: "city-ref",
    npWarehouseRef: "wh-ref",
    npRecipientName: "Іваненко Іван Петрович",
    npRecipientPhone: "0501112233",
    npPayerType: null,
    cashOnDelivery: false,
    codAmountUah: null,
    declaredValueEnabled: true,
    declaredValueUah: null,
    totalUah: 5000,
    customer: { name: "ТОВ Клієнт" },
    items: [
      {
        weight: 20,
        product: {
          receiptName: "Одяг вживаний",
          categoryId: "c1",
          name: "Куртки",
        },
      },
    ],
    ...overrides,
  };
}

describe("splitRecipientName", () => {
  it("splits full ПІБ into last/first/middle", () => {
    expect(splitRecipientName("Іваненко Іван Петрович")).toEqual({
      lastName: "Іваненко",
      firstName: "Іван",
      middleName: "Петрович",
    });
  });
  it("duplicates single word into last+first", () => {
    expect(splitRecipientName("Магазин")).toEqual({
      lastName: "Магазин",
      firstName: "Магазин",
      middleName: "",
    });
  });
  it("joins extra words into middle name", () => {
    const r = splitRecipientName("Петренко Іван Іванович Молодший");
    expect(r.lastName).toBe("Петренко");
    expect(r.firstName).toBe("Іван");
    expect(r.middleName).toBe("Іванович Молодший");
  });
});

describe("createTtnForSale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NP_SENDER_CITY_REF = "sender-city";
    process.env.NP_SENDER_WAREHOUSE_REF = "sender-wh";
    process.env.NP_SENDER_PHONE = "380632396395";
    h.getDeliveryLabelResolver.mockResolvedValue((code: string) =>
      code === "post" ? "Нова Пошта" : code,
    );
    h.getSenderCounterparty.mockResolvedValue({ ref: "sender-cp" });
    h.getSenderContact.mockResolvedValue({ ref: "sender-contact" });
    h.ensureRecipientPrivatePerson.mockResolvedValue({
      counterpartyRef: "r-cp",
      contactRef: "r-contact",
    });
    h.createInternetDocument.mockResolvedValue({
      ref: "ttn-ref-1",
      number: "20450000000001",
      costUah: "70",
      estimatedDeliveryDate: "",
    });
    h.updateInternetDocument.mockResolvedValue({
      ref: "ttn-ref-1",
      number: "20450000000001",
      costUah: "90",
      estimatedDeliveryDate: "",
    });
  });

  it("skips when TTN already exists", async () => {
    h.sale.findUnique.mockResolvedValue(baseSale({ ttnRef: "already" }));
    await createTtnForSale("s1");
    expect(h.createInternetDocument).not.toHaveBeenCalled();
  });

  it("skips when delivery is not Nova Poshta", async () => {
    h.sale.findUnique.mockResolvedValue(baseSale({ deliveryMethod: "pickup" }));
    await createTtnForSale("s1");
    expect(h.createInternetDocument).not.toHaveBeenCalled();
  });

  it("records an error when the recipient warehouse is missing", async () => {
    h.sale.findUnique.mockResolvedValue(baseSale({ npWarehouseRef: null }));
    await createTtnForSale("s1");
    expect(h.createInternetDocument).not.toHaveBeenCalled();
    expect(h.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: expect.objectContaining({
          ttnError: expect.stringContaining("відділення"),
        }),
      }),
    );
  });

  it("creates a TTN and stores ref + number on success", async () => {
    h.sale.findUnique.mockResolvedValue(baseSale());
    await createTtnForSale("s1");

    expect(h.createInternetDocument).toHaveBeenCalledTimes(1);
    const input = h.createInternetDocument.mock.calls[0]![0];
    expect(input).toMatchObject({
      serviceType: "WarehouseWarehouse",
      cargoType: "Parcel",
      weight: 20,
      seatsAmount: 1,
      description: "Одяг вживаний",
      cost: 5000,
      payerType: "Recipient",
      recipientWarehouseRef: "wh-ref",
      cityRecipientRef: "city-ref",
      recipientName: "Іваненко Іван Петрович",
    });
    expect(input.afterpaymentOnGoodsCost).toBeUndefined();

    expect(h.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: expect.objectContaining({
          ttnRef: "ttn-ref-1",
          expressWaybill: "20450000000001",
          ttnError: null,
        }),
      }),
    );
    expect(h.warehouseTask.updateMany).toHaveBeenCalledWith({
      where: { saleId: "s1" },
      data: { expressWaybill: "20450000000001" },
    });
  });

  it("adds «Контроль оплати» (AfterpaymentOnGoodsCost) when cash on delivery", async () => {
    h.sale.findUnique.mockResolvedValue(
      baseSale({ cashOnDelivery: true, codAmountUah: 4200 }),
    );
    await createTtnForSale("s1");
    const input = h.createInternetDocument.mock.calls[0]![0];
    expect(input.afterpaymentOnGoodsCost).toBe(4200);
    expect(input.backwardDeliveryCod).toBeUndefined();
  });

  it("honours a Sender payer type", async () => {
    h.sale.findUnique.mockResolvedValue(baseSale({ npPayerType: "Sender" }));
    await createTtnForSale("s1");
    expect(h.createInternetDocument.mock.calls[0]![0].payerType).toBe("Sender");
  });

  it("records the NP error and does not store a ref on failure", async () => {
    h.sale.findUnique.mockResolvedValue(baseSale());
    h.createInternetDocument.mockResolvedValue({ error: "NP відхилив запит" });
    await createTtnForSale("s1");
    expect(h.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ttnError: "NP відхилив запит" }),
      }),
    );
    // Не має бути update з ttnRef.
    const wroteRef = h.sale.update.mock.calls.some(
      (c) => (c[0] as { data?: { ttnRef?: string } }).data?.ttnRef,
    );
    expect(wroteRef).toBe(false);
  });
});

describe("updateTtnForSale (Фаза 2 — місця/габарити)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NP_SENDER_CITY_REF = "sender-city";
    process.env.NP_SENDER_WAREHOUSE_REF = "sender-wh";
    process.env.NP_SENDER_PHONE = "380632396395";
    h.getDeliveryLabelResolver.mockResolvedValue((code: string) =>
      code === "post" ? "Нова Пошта" : code,
    );
    h.getSenderCounterparty.mockResolvedValue({ ref: "sender-cp" });
    h.getSenderContact.mockResolvedValue({ ref: "sender-contact" });
    h.ensureRecipientPrivatePerson.mockResolvedValue({
      counterpartyRef: "r-cp",
      contactRef: "r-contact",
    });
    h.updateInternetDocument.mockResolvedValue({
      ref: "ttn-ref-1",
      number: "20450000000001",
      costUah: "90",
      estimatedDeliveryDate: "",
    });
  });

  const seats = [
    { weight: 30, lengthCm: 120, widthCm: 80, heightCm: 60 },
    { weight: 20, lengthCm: 60, widthCm: 40, heightCm: 40 },
  ];

  it("updates the existing TTN with real seats (OptionsSeat + summed weight)", async () => {
    h.sale.findUnique.mockResolvedValue(baseSale({ ttnRef: "ttn-ref-1" }));
    const res = await updateTtnForSale("s1", seats);

    expect(res.ok).toBe(true);
    expect(h.updateInternetDocument).toHaveBeenCalledTimes(1);
    const [ref, input] = h.updateInternetDocument.mock.calls[0]!;
    expect(ref).toBe("ttn-ref-1");
    expect(input.seatsAmount).toBe(2);
    expect(input.weight).toBe(50); // 30 + 20
    expect(input.optionsSeat).toEqual([
      {
        volumetricWidth: 80,
        volumetricLength: 120,
        volumetricHeight: 60,
        weight: 30,
      },
      {
        volumetricWidth: 40,
        volumetricLength: 60,
        volumetricHeight: 40,
        weight: 20,
      },
    ]);
  });

  it("creates the TTN with seats when none exists yet", async () => {
    h.sale.findUnique.mockResolvedValue(baseSale({ ttnRef: null }));
    h.createInternetDocument.mockResolvedValue({
      ref: "new-ttn",
      number: "20459999999999",
      costUah: "90",
      estimatedDeliveryDate: "",
    });
    const res = await updateTtnForSale("s1", seats);
    expect(res.ok).toBe(true);
    expect(res.number).toBe("20459999999999");
    expect(h.createInternetDocument).toHaveBeenCalledTimes(1);
    expect(h.updateInternetDocument).not.toHaveBeenCalled();
  });

  it("returns an error when the sale is not Nova Poshta", async () => {
    h.sale.findUnique.mockResolvedValue(
      baseSale({ ttnRef: "ttn-ref-1", deliveryMethod: "pickup" }),
    );
    const res = await updateTtnForSale("s1", seats);
    expect(res.ok).toBe(false);
    expect(h.updateInternetDocument).not.toHaveBeenCalled();
  });
});
