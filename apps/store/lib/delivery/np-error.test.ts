import { describe, it, expect } from "vitest";
import { translateNpError } from "./np-error";

describe("translateNpError", () => {
  it("translates the special-cargo weight error to freight-warehouse guidance", () => {
    const msg = translateNpError("Special Cargo seat not match in weight");
    expect(msg).toMatch(/вантажне/i);
  });

  it("translates AfterpaymentOnGoodsCost unavailable", () => {
    expect(translateNpError("AfterpaymentOnGoodsCost is unavailable")).toMatch(
      /Контроль оплати/i,
    );
  });

  it("keeps our own Ukrainian messages as-is", () => {
    const ours = "Оберіть місто й відділення Нової Пошти у реалізації.";
    expect(translateNpError(ours)).toBe(ours);
  });

  it("prefixes unknown English errors", () => {
    expect(translateNpError("Some unknown backend error")).toBe(
      "Нова Пошта: Some unknown backend error",
    );
  });

  it("handles empty input", () => {
    expect(translateNpError("")).toMatch(/Невідома помилка/);
    expect(translateNpError(null)).toMatch(/Невідома помилка/);
  });
});
