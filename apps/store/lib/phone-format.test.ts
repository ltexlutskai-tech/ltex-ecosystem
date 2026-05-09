import { describe, expect, it } from "vitest";
import { formatPhone, phoneDigitsOnly, isValidUaPhone } from "./phone-format";

describe("formatPhone", () => {
  it("formats 0XXXXXXXXX (10 digits starting with 0) as full UA number", () => {
    expect(formatPhone("0671234567")).toBe("+380 67 123 45 67");
  });

  it("formats +380XXXXXXXXX as canonical", () => {
    expect(formatPhone("+380671234567")).toBe("+380 67 123 45 67");
  });

  it("formats 380XXXXXXXXX as canonical", () => {
    expect(formatPhone("380671234567")).toBe("+380 67 123 45 67");
  });

  it("strips junk from (067) 123-45-67", () => {
    expect(formatPhone("(067) 123-45-67")).toBe("+380 67 123 45 67");
  });

  it("returns empty string for empty input", () => {
    expect(formatPhone("")).toBe("");
  });

  it("formats partial input gracefully (3 digits)", () => {
    expect(formatPhone("067")).toBe("+067");
  });

  it("formats partial input gracefully (5 digits)", () => {
    expect(formatPhone("38067")).toBe("+380 67");
  });

  it("formats partial input gracefully (8 digits)", () => {
    expect(formatPhone("38067123")).toBe("+380 67 123");
  });

  it("formats partial input gracefully (10 digits with 38 prefix)", () => {
    expect(formatPhone("3806712345")).toBe("+380 67 123 45");
  });

  it("truncates extra digits beyond 12", () => {
    expect(formatPhone("+380671234567890")).toBe("+380 67 123 45 67");
  });
});

describe("phoneDigitsOnly", () => {
  it("returns digits only from formatted phone", () => {
    expect(phoneDigitsOnly("+380 67 671 05 15")).toBe("380676710515");
  });

  it("returns empty string for empty input", () => {
    expect(phoneDigitsOnly("")).toBe("");
  });
});

describe("isValidUaPhone", () => {
  it("validates a full canonical UA number", () => {
    expect(isValidUaPhone("+380 67 123 45 67")).toBe(true);
  });

  it("rejects too-short numbers", () => {
    expect(isValidUaPhone("+380 67 123")).toBe(false);
  });

  it("rejects non-UA prefix", () => {
    expect(isValidUaPhone("+1 555 123 4567")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidUaPhone("")).toBe(false);
  });
});
