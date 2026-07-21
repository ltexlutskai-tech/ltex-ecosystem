import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useClientEdit, extractEditableFields } from "./use-client-edit";
import type { ClientDetail } from "../_components/types";

function baseClient(overrides: Partial<ClientDetail> = {}): ClientDetail {
  return {
    id: "c1",
    viewerOwnership: "mine",
    code1C: "000005798",
    name: "Test Client",
    tradePointName: "ТТ-1",
    phonePrimary: "+380501112233",
    viberContact: null,
    city: "Київ",
    region: "Київська",
    street: "Lesi",
    house: "10",
    novaPoshtaBranch: null,
    npCityRef: null,
    npCityName: null,
    npWarehouseRef: null,
    npWarehouseName: null,
    npAddressMatchedAt: null,
    geolocation: null,
    websiteUrl: null,
    monthlyVolume: "100",
    licenseExpiresAt: null,
    isOwn: false,
    debt: "0",
    overdueDebt: "0",
    tovDebt: null,
    tovOverdueDebt: null,
    sessionRemainder: null,
    daysSinceLastPurchase: null,
    lastPurchaseAt: null,
    hasNewMessage: false,
    isViberLinked: false,
    dialogStatus: null,
    keywords: null,
    email: null,
    legalType: null,
    inn: null,
    edrpou: null,
    fullName: null,
    comment: null,
    additionalDescription: null,
    workingHours: null,
    parentCode1C: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    lastSyncedAt: null,
    statusGeneral: null,
    statusGeneralId: "cstatus1",
    statusOperational: null,
    statusOperationalId: null,
    searchChannel: null,
    searchChannelId: null,
    categoryTT: null,
    categoryTTId: null,
    deliveryMethod: null,
    deliveryMethodId: null,
    primaryAssortment: null,
    primaryAssortmentId: null,
    priceType: null,
    priceTypeId: null,
    primaryRoute: null,
    primaryRouteId: null,
    agent: null,
    agentUserId: null,
    phones: [],
    messengers: [],
    warehouses: [],
    routes: [],
    assortmentItems: [],
    presentations: [],
    bankAccounts: [],
    contacts: [],
    reminders: [],
    timeline: [],
    assignedManager: null,
    parentClient: null,
    childClients: [],
    ...overrides,
  };
}

describe("useClientEdit", () => {
  it("initial state mirrors client editable fields, no dirty", () => {
    const client = baseClient();
    const { result } = renderHook(() => useClientEdit(client));
    expect(result.current.values.name).toBe("Test Client");
    expect(result.current.values.statusGeneralId).toBe("cstatus1");
    expect(result.current.values.monthlyVolume).toBe(100);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.dirtyKeys).toEqual([]);
  });

  it("setField updates values and marks dirty", () => {
    const client = baseClient();
    const { result } = renderHook(() => useClientEdit(client));
    act(() => {
      result.current.setField("name", "Renamed");
    });
    expect(result.current.values.name).toBe("Renamed");
    expect(result.current.isDirty).toBe(true);
    expect(result.current.dirtyKeys).toEqual(["name"]);
  });

  it("dirtyKeys reflects multiple changed fields", () => {
    const client = baseClient();
    const { result } = renderHook(() => useClientEdit(client));
    act(() => {
      result.current.setField("name", "Renamed");
      result.current.setField("city", "Львів");
      result.current.setField("hasNewMessage", true);
    });
    expect(result.current.dirtyKeys.sort()).toEqual(
      ["city", "hasNewMessage", "name"].sort(),
    );
  });

  it("reset restores initial values and clears dirty", () => {
    const client = baseClient();
    const { result } = renderHook(() => useClientEdit(client));
    act(() => result.current.setField("name", "X"));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.reset());
    expect(result.current.values.name).toBe("Test Client");
    expect(result.current.isDirty).toBe(false);
  });

  it("diff() returns only changed keys", () => {
    const client = baseClient();
    const { result } = renderHook(() => useClientEdit(client));
    act(() => {
      result.current.setField("name", "Y");
      result.current.setField("monthlyVolume", 250);
    });
    const diff = result.current.diff();
    expect(diff).toEqual({ name: "Y", monthlyVolume: 250 });
  });

  it("setting same value back to original clears dirty for that field", () => {
    const client = baseClient();
    const { result } = renderHook(() => useClientEdit(client));
    act(() => result.current.setField("name", "Other"));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.setField("name", "Test Client"));
    expect(result.current.isDirty).toBe(false);
  });
});

describe("extractEditableFields", () => {
  it("converts monthlyVolume string to number", () => {
    const f = extractEditableFields(baseClient({ monthlyVolume: "250.5" }));
    expect(f.monthlyVolume).toBe(250.5);
  });

  it("null monthlyVolume stays null", () => {
    const f = extractEditableFields(baseClient({ monthlyVolume: null }));
    expect(f.monthlyVolume).toBeNull();
  });
});
