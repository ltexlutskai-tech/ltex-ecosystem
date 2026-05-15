import { describe, it, expect } from "vitest";
import {
  clientUpdatePayloadSchema,
  syncEntityTypeSchema,
  syncJobActionSchema,
} from "./sync-job";

describe("clientUpdatePayloadSchema", () => {
  it("accepts minimal valid payload (just name)", () => {
    const result = clientUpdatePayloadSchema.safeParse({ name: "Test client" });
    expect(result.success).toBe(true);
  });

  it("rejects coли name is missing", () => {
    const result = clientUpdatePayloadSchema.safeParse({ city: "Київ" });
    expect(result.success).toBe(false);
  });

  it("rejects empty-string name", () => {
    const result = clientUpdatePayloadSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("accepts повний payload з усіма FK codes", () => {
    const result = clientUpdatePayloadSchema.safeParse({
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
      monthlyVolume: "150.50",
      licenseExpiresAt: "2026-12-31T00:00:00.000Z",
      viberContact: "+380501112233",
      dialogStatus: null,
      statusGeneralCode: "active",
      statusOperationalCode: null,
      categoryTTCode: null,
      deliveryMethodCode: "nova-poshta",
      searchChannelCode: "google",
      primaryRouteCode: null,
      primaryAssortmentCode: null,
      priceTypeCode: "wholesale",
      agentCode1C: "U0001",
    });
    expect(result.success).toBe(true);
  });

  it("strict-режим: відкидає unknown полів", () => {
    const result = clientUpdatePayloadSchema.safeParse({
      name: "X",
      bogusField: "trash",
    });
    expect(result.success).toBe(false);
  });

  it("monthlyVolume є string а не number (важливо для 1С)", () => {
    const numericValue = clientUpdatePayloadSchema.safeParse({
      name: "X",
      monthlyVolume: 100,
    });
    expect(numericValue.success).toBe(false);
    const stringValue = clientUpdatePayloadSchema.safeParse({
      name: "X",
      monthlyVolume: "100.50",
    });
    expect(stringValue.success).toBe(true);
  });
});

describe("syncJobActionSchema", () => {
  it("приймає update і create", () => {
    expect(syncJobActionSchema.safeParse("update").success).toBe(true);
    expect(syncJobActionSchema.safeParse("create").success).toBe(true);
  });

  it("відкидає невідомий action", () => {
    expect(syncJobActionSchema.safeParse("delete").success).toBe(false);
  });
});

describe("syncEntityTypeSchema", () => {
  it("приймає три валідні entity types", () => {
    expect(syncEntityTypeSchema.safeParse("client").success).toBe(true);
    expect(syncEntityTypeSchema.safeParse("order").success).toBe(true);
    expect(syncEntityTypeSchema.safeParse("payment").success).toBe(true);
  });
});
