import { describe, expect, it } from "vitest";
import { formatDocNumber, formatOrderNumber } from "./order-number";

describe("formatOrderNumber", () => {
  it("prefers trimmed number1C", () => {
    expect(
      formatOrderNumber({ number1C: " L0000002477 ", code1C: "deadbeef" }),
    ).toBe("L0000002477");
  });

  it("falls back to short code1C unchanged", () => {
    expect(formatOrderNumber({ code1C: "abc123" })).toBe("abc123");
  });

  it("shortens long hex code1C", () => {
    expect(formatOrderNumber({ code1C: "0123456789abcdef" })).toBe("…abcdef");
  });

  it("returns dash when nothing", () => {
    expect(formatOrderNumber({})).toBe("—");
  });
});

describe("formatDocNumber", () => {
  it("prefers trimmed number1C", () => {
    expect(
      formatDocNumber({
        number1C: " L0000001335 ",
        code1C: "deadbeef",
        docNumber: 7,
      }),
    ).toBe("L0000001335");
  });

  it("falls back to №docNumber when no number1C", () => {
    expect(formatDocNumber({ code1C: "deadbeef", docNumber: 7 })).toBe("№7");
  });

  it("treats docNumber 0 as present", () => {
    expect(formatDocNumber({ docNumber: 0 })).toBe("№0");
  });

  it("falls back to shortened code1C when no number1C/docNumber", () => {
    expect(formatDocNumber({ code1C: "0123456789abcdef" })).toBe("…abcdef");
  });

  it("returns short code1C unchanged", () => {
    expect(formatDocNumber({ code1C: "abc123" })).toBe("abc123");
  });

  it("returns dash when nothing", () => {
    expect(formatDocNumber({})).toBe("—");
  });
});
