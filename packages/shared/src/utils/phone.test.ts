import { describe, expect, it } from "vitest";
import {
  formatPhoneUkr,
  normalizePhone,
  phoneToTelUrl,
  phoneToViberUrl,
  phoneToWhatsAppUrl,
} from "./phone";

describe("normalizePhone", () => {
  it("normalizes 0XX format", () => {
    expect(normalizePhone("0501234567")).toBe("+380501234567");
  });

  it("normalizes +380 format with spaces/dashes", () => {
    expect(normalizePhone("+380 (50) 123-45-67")).toBe("+380501234567");
  });

  it("normalizes bare 380 prefix", () => {
    expect(normalizePhone("380501234567")).toBe("+380501234567");
  });

  it("normalizes 9-digit без префіксу", () => {
    expect(normalizePhone("501234567")).toBe("+380501234567");
  });

  it("returns null for null/empty/whitespace input", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
  });

  it("returns null for too-short/too-long inputs", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("+38050123456789999")).toBeNull();
  });
});

describe("formatPhoneUkr", () => {
  it("formats Ukrainian phone з пробілами між блоками", () => {
    expect(formatPhoneUkr("0501234567")).toBe("+380 50 123 45 67");
  });

  it("returns original string якщо нормалізація не вдалася", () => {
    expect(formatPhoneUkr("invalid")).toBe("invalid");
  });

  it("returns empty string for empty/null input", () => {
    expect(formatPhoneUkr(null)).toBe("");
    expect(formatPhoneUkr(undefined)).toBe("");
  });
});

describe("phone deeplinks", () => {
  it("builds tel: URL", () => {
    expect(phoneToTelUrl("0501234567")).toBe("tel:+380501234567");
  });

  it("builds viber:// URL з URL-encoded number", () => {
    expect(phoneToViberUrl("0501234567")).toBe(
      "viber://chat?number=%2B380501234567",
    );
  });

  it("builds wa.me URL без +", () => {
    expect(phoneToWhatsAppUrl("0501234567")).toBe("https://wa.me/380501234567");
  });

  it("returns null для invalid input", () => {
    expect(phoneToTelUrl(null)).toBeNull();
    expect(phoneToViberUrl("")).toBeNull();
    expect(phoneToWhatsAppUrl("xx")).toBeNull();
  });
});
