import { describe, it, expect } from "vitest";

import { extractNameCode } from "./audit-duplicate-products";

describe("extractNameCode", () => {
  it("витягає провідний 4-значний код у дужках", () => {
    expect(extractNameCode("(0024) Велосипедне взуття")).toBe("0024");
    expect(extractNameCode("(0100) Взуття жіноче -39р")).toBe("0100");
  });

  it("толерантний до пробілів на початку", () => {
    expect(extractNameCode("  (1235) x")).toBe("1235");
  });

  it("не матчить 4-значні числа деінде в назві", () => {
    expect(extractNameCode("Куртка 2024 зимова")).toBeNull();
  });

  it("повертає null коли коду немає", () => {
    expect(extractNameCode("Без коду")).toBeNull();
    expect(extractNameCode("")).toBeNull();
  });

  it("не матчить не-4-значні коди в дужках", () => {
    expect(extractNameCode("(123) короткий")).toBeNull();
  });
});
