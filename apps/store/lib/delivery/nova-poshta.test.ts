import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callNovaPoshta,
  searchCities,
  getWarehouses,
  createInternetDocument,
  buildTtnMethodProperties,
  trackTtn,
  __resetSenderCache,
  type CreateTtnInput,
} from "./nova-poshta";

const baseTtnInput: CreateTtnInput = {
  cargoType: "Parcel",
  weight: 12,
  serviceType: "WarehouseWarehouse",
  seatsAmount: 1,
  description: "Секонд хенд",
  cost: 500,
  senderCounterpartyRef: "sender-cp",
  senderContactRef: "sender-contact",
  citySenderRef: "city-sender",
  senderWarehouseRef: "wh-sender",
  senderPhone: "380671234567",
  recipientCounterpartyRef: "rec-cp",
  recipientContactRef: "rec-contact",
  cityRecipientRef: "city-rec",
  recipientWarehouseRef: "wh-rec",
  recipientPhone: "380509876543",
  recipientName: "Іван Іванов",
};

function mockFetchOnce(body: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    json: async () => body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  __resetSenderCache();
  process.env.NOVA_POSHTA_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.NOVA_POSHTA_API_KEY;
});

describe("callNovaPoshta — missing key", () => {
  it("returns success:false without throwing when key absent", async () => {
    delete process.env.NOVA_POSHTA_API_KEY;
    const fetchFn = mockFetchOnce({ success: true, data: [] });

    const res = await callNovaPoshta("Address", "getCities", {});

    expect(res.success).toBe(false);
    expect(res.errors).toContain("NOVA_POSHTA_API_KEY not set");
    expect(res.data).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("normalizes object-shaped errors and network errors", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("boom"));
    vi.stubGlobal("fetch", fetchFn);

    const res = await callNovaPoshta("Address", "getCities", {});
    expect(res.success).toBe(false);
    expect(res.errors).toEqual(["boom"]);
  });
});

describe("searchCities", () => {
  it("maps raw NP city fields to domain shape", async () => {
    const fetchFn = mockFetchOnce({
      success: true,
      data: [
        {
          Ref: "city-ref-1",
          Description: "Луцьк",
          AreaDescription: "Волинська",
        },
      ],
      errors: [],
      warnings: [],
    });

    const cities = await searchCities("Луцьк", 5);

    expect(cities).toEqual([
      { ref: "city-ref-1", name: "Луцьк", area: "Волинська" },
    ]);
    const firstCall = fetchFn.mock.calls[0];
    expect(firstCall).toBeDefined();
    const sentBody = JSON.parse((firstCall![1] as { body: string }).body);
    expect(sentBody.modelName).toBe("Address");
    expect(sentBody.calledMethod).toBe("getCities");
    expect(sentBody.methodProperties).toEqual({
      FindByString: "Луцьк",
      Limit: "5",
    });
  });
});

describe("getWarehouses", () => {
  it("maps raw NP warehouse fields incl numeric maxWeight", async () => {
    mockFetchOnce({
      success: true,
      data: [
        {
          Ref: "wh-1",
          Number: "5",
          Description: "Відділення №5",
          TypeOfWarehouseRef: "type-ref",
          TotalMaxWeightAllowed: "30",
        },
      ],
    });

    const warehouses = await getWarehouses("city-ref", "5", 10);

    expect(warehouses).toEqual([
      {
        ref: "wh-1",
        number: "5",
        name: "Відділення №5",
        typeRef: "type-ref",
        maxWeight: 30,
      },
    ]);
  });
});

describe("createInternetDocument", () => {
  it("maps success response to created ttn shape", async () => {
    mockFetchOnce({
      success: true,
      data: [
        {
          Ref: "doc-ref",
          IntDocNumber: "20450000000000",
          CostOnSite: "70",
          EstimatedDeliveryDate: "2026-07-22",
        },
      ],
    });

    const result = await createInternetDocument(baseTtnInput);

    expect(result).toEqual({
      ref: "doc-ref",
      number: "20450000000000",
      costUah: "70",
      estimatedDeliveryDate: "2026-07-22",
    });
  });

  it("returns error when NP responds success:false", async () => {
    mockFetchOnce({
      success: false,
      data: [],
      errors: ["Some NP error"],
    });

    const result = await createInternetDocument(baseTtnInput);

    expect(result).toEqual({ error: "Some NP error" });
  });
});

describe("buildTtnMethodProperties", () => {
  it("applies defaults and maps refs to NP field names", () => {
    const props = buildTtnMethodProperties(baseTtnInput);

    expect(props.PayerType).toBe("Recipient");
    expect(props.PaymentMethod).toBe("Cash");
    expect(props.Weight).toBe("12");
    expect(props.SeatsAmount).toBe("1");
    expect(props.SenderAddress).toBe("wh-sender");
    expect(props.RecipientAddress).toBe("wh-rec");
    expect(props.NewAddress).toBe("1");
    expect(props.BackwardDeliveryData).toBeUndefined();
    expect(props.AfterpaymentOnGoodsCost).toBeUndefined();
    expect(props.OptionsSeat).toBeUndefined();
  });

  it("isDraftTtn: only StatusCode 1 is a draft", async () => {
    const { isDraftTtn } = await import("./nova-poshta");
    expect(isDraftTtn("1")).toBe(true);
    expect(isDraftTtn("2")).toBe(false);
    expect(isDraftTtn(null)).toBe(false);
    expect(isDraftTtn(undefined)).toBe(false);
  });

  it("adds AfterpaymentOnGoodsCost (Контроль оплати) when set", () => {
    const props = buildTtnMethodProperties({
      ...baseTtnInput,
      afterpaymentOnGoodsCost: 4200,
    });
    expect(props.AfterpaymentOnGoodsCost).toBe("4200");
    // «Контроль оплати» — це НЕ класична післяплата.
    expect(props.BackwardDeliveryData).toBeUndefined();
  });

  it("adds BackwardDeliveryData when cod set", () => {
    const props = buildTtnMethodProperties({
      ...baseTtnInput,
      backwardDeliveryCod: 1500,
    });

    expect(props.BackwardDeliveryData).toEqual([
      {
        PayerType: "Recipient",
        CargoType: "Money",
        RedeliveryString: "1500",
      },
    ]);
  });

  it("adds OptionsSeat (dimensions as strings) when provided", () => {
    const props = buildTtnMethodProperties({
      ...baseTtnInput,
      optionsSeat: [
        {
          volumetricWidth: 30,
          volumetricLength: 40,
          volumetricHeight: 20,
          weight: 12,
        },
      ],
    });

    expect(props.OptionsSeat).toEqual([
      {
        volumetricWidth: "30",
        volumetricLength: "40",
        volumetricHeight: "20",
        weight: "12",
      },
    ]);
  });

  it("maps specialCargo (ручна обробка) to '1' in OptionsSeat", () => {
    const props = buildTtnMethodProperties({
      ...baseTtnInput,
      cargoType: "Cargo",
      optionsSeat: [
        {
          volumetricWidth: 60,
          volumetricLength: 100,
          volumetricHeight: 50,
          weight: 25,
          specialCargo: true,
        },
      ],
    });
    const seat = (props.OptionsSeat as Array<Record<string, string>>)[0]!;
    expect(seat.specialCargo).toBe("1");
    expect(props.CargoType).toBe("Cargo");
  });

  it("omits RecipientAddress for WarehouseDoors without warehouse ref", () => {
    const props = buildTtnMethodProperties({
      ...baseTtnInput,
      serviceType: "WarehouseDoors",
      recipientWarehouseRef: undefined,
    });

    expect(props.RecipientAddress).toBeUndefined();
    expect(props.ServiceType).toBe("WarehouseDoors");
  });
});

describe("trackTtn", () => {
  it("maps tracking fields", async () => {
    mockFetchOnce({
      success: true,
      data: [
        {
          Status: "Прибув у відділення",
          StatusCode: "7",
          ScheduledDeliveryDate: "2026-07-22",
          RecipientAddress: "Луцьк, Відділення №5",
          WarehouseRecipient: "Відділення №5",
        },
      ],
    });

    const result = await trackTtn("20450000000000");

    expect(result).toEqual({
      status: "Прибув у відділення",
      statusCode: "7",
      scheduledDeliveryDate: "2026-07-22",
      recipientAddress: "Луцьк, Відділення №5",
      warehouseRecipient: "Відділення №5",
    });
  });

  it("returns null when no data", async () => {
    mockFetchOnce({ success: true, data: [] });
    const result = await trackTtn("nope");
    expect(result).toBeNull();
  });
});
