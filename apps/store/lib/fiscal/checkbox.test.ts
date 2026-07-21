import { describe, it, expect } from "vitest";
import { asciiHeader } from "./checkbox";

describe("asciiHeader (Latin-1 safe HTTP header)", () => {
  it("strips Cyrillic → Latin-1 safe (fixes ByteString crash)", () => {
    // «Експрес-накладна (API)» — кирилиця валила fetch (символ 1045 > 255).
    const out = asciiHeader("Експрес-накладна (API)", "LTEX Express API");
    // Результат не містить символів > 255 (безпечний для HTTP-заголовка).
    expect([...out].every((c) => c.charCodeAt(0) <= 255)).toBe(true);
    // Повністю кириличне значення → fallback.
    expect(asciiHeader("Експрес", "LTEX Express API")).toBe("LTEX Express API");
  });

  it("keeps pure ASCII values", () => {
    expect(asciiHeader("LTEX-Express", "fallback")).toBe("LTEX-Express");
  });

  it("empty/undefined → fallback", () => {
    expect(asciiHeader(undefined, "fb")).toBe("fb");
    expect(asciiHeader("   ", "fb")).toBe("fb");
  });
});
