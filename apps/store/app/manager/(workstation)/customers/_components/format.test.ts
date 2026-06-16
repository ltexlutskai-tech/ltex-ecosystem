import { describe, expect, it } from "vitest";
import { formatEur } from "./format";

describe("formatEur", () => {
  it("formats a positive number with € suffix", () => {
    expect(formatEur(1234.5)).toBe("1 234,50 €");
  });

  it("formats a negative number with a minus sign and € suffix", () => {
    expect(formatEur(-1234.5)).toBe("−1 234,50 €");
  });

  it("formats zero with two fraction digits", () => {
    expect(formatEur(0)).toBe("0,00 €");
  });

  it("accepts a numeric string", () => {
    expect(formatEur("42")).toBe("42,00 €");
  });

  it("returns the placeholder for non-numeric input", () => {
    expect(formatEur("abc")).toBe("—");
  });
});
