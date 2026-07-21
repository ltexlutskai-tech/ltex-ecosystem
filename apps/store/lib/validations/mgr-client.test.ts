import { describe, it, expect } from "vitest";
import { mgrClientPatchSchema } from "./mgr-client";

describe("mgrClientPatchSchema", () => {
  it("accepts a valid full payload", () => {
    const parsed = mgrClientPatchSchema.safeParse({
      name: "Test Client",
      tradePointName: "ТТ-1",
      region: "Київська",
      city: "Київ",
      street: "Lesi",
      house: "10",
      novaPoshtaBranch: "5",
      websiteUrl: "https://example.com",
      geolocation: "50.7472,25.3254",
      viberContact: "+380501112233",
      monthlyVolume: 250,
      licenseExpiresAt: new Date("2026-12-31").toISOString(),
      hasNewMessage: true,
      isViberLinked: false,
      dialogStatus: "open",
      statusGeneralId: "cstatus1",
      statusOperationalId: "cstatus2",
      categoryTTId: "ccat1",
      priceTypeId: "cprice1",
      primaryAssortmentId: "cassort1",
      deliveryMethodId: "cdeliv1",
      searchChannelId: "cchan1",
      primaryRouteId: "croute1",
      agentUserId: "cuser1",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty payload (no-op)", () => {
    const parsed = mgrClientPatchSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(Object.keys(parsed.data)).toHaveLength(0);
  });

  it("rejects invalid website URL", () => {
    const parsed = mgrClientPatchSchema.safeParse({
      websiteUrl: "not-a-url",
    });
    expect(parsed.success).toBe(false);
  });

  it("allows empty string for websiteUrl (means clear)", () => {
    const parsed = mgrClientPatchSchema.safeParse({ websiteUrl: "" });
    expect(parsed.success).toBe(true);
  });

  it("accepts structured Nova Poshta refs (звірка адреси)", () => {
    const parsed = mgrClientPatchSchema.safeParse({
      npCityRef: "db5c88f0-city",
      npCityName: "Луцьк",
      npWarehouseRef: "1ec09d2e-wh",
      npWarehouseName: "Відділення №1: вул. Центральна",
    });
    expect(parsed.success).toBe(true);
  });

  it("allows empty NP refs (means clear / not matched)", () => {
    const parsed = mgrClientPatchSchema.safeParse({
      npCityRef: "",
      npWarehouseRef: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid date string for licenseExpiresAt", () => {
    const parsed = mgrClientPatchSchema.safeParse({
      licenseExpiresAt: "not-a-date",
    });
    expect(parsed.success).toBe(false);
  });

  it("allows null to clear licenseExpiresAt", () => {
    const parsed = mgrClientPatchSchema.safeParse({ licenseExpiresAt: null });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown fields (strict mode)", () => {
    const parsed = mgrClientPatchSchema.safeParse({
      name: "Ok",
      debt: "100.00",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects negative monthlyVolume", () => {
    const parsed = mgrClientPatchSchema.safeParse({ monthlyVolume: -5 });
    expect(parsed.success).toBe(false);
  });

  it("accepts null for FK fields (clear)", () => {
    const parsed = mgrClientPatchSchema.safeParse({
      statusGeneralId: null,
      categoryTTId: null,
      agentUserId: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty string for required name", () => {
    const parsed = mgrClientPatchSchema.safeParse({ name: "" });
    expect(parsed.success).toBe(false);
  });
});
