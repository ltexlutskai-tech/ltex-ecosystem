import { describe, it, expect } from "vitest";
import { nextSectorBarcode } from "./sector-barcode";

describe("nextSectorBarcode", () => {
  it("перший код при порожньому довіднику", () => {
    expect(nextSectorBarcode([])).toBe("SEC000001");
  });
  it("продовжує максимальний номер", () => {
    expect(nextSectorBarcode(["SEC000001", "SEC000007", "SEC000003"])).toBe(
      "SEC000008",
    );
  });
  it("ігнорує чужі/порожні коди", () => {
    expect(nextSectorBarcode(["SECTOR-A", null, "200099", "SEC000002"])).toBe(
      "SEC000003",
    );
  });
});
