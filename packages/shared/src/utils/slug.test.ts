import { describe, it, expect } from "vitest";
import { transliterate, generateSlug } from "./slug";

describe("transliterate", () => {
  it("transliterates basic Ukrainian letters", () => {
    expect(transliterate("абвгґд")).toBe("abvhgd");
  });

  it("transliterates complex digraphs", () => {
    expect(transliterate("жзщшчц")).toBe("zhzshchshchts");
  });

  it("handles є, ї, ю, я", () => {
    expect(transliterate("єїюя")).toBe("yeyiyuya");
  });

  it("removes ь (soft sign)", () => {
    expect(transliterate("ь")).toBe("");
    expect(transliterate("більше")).toBe("bilshe");
  });

  it("lowercases input", () => {
    expect(transliterate("Київ")).toBe("kyyiv");
  });

  it("passes through Latin characters", () => {
    expect(transliterate("hello")).toBe("hello");
  });

  it("passes through digits", () => {
    expect(transliterate("тест123")).toBe("test123");
  });
});

describe("generateSlug", () => {
  it("generates slug from Ukrainian text", () => {
    expect(generateSlug("Футболки чоловічі")).toBe("futbolky-cholovichi");
  });

  it("replaces non-alphanumeric with hyphens", () => {
    expect(generateSlug("one & two")).toBe("one-two");
  });

  it("trims leading and trailing hyphens", () => {
    expect(generateSlug("  привіт  ")).toBe("pryvit");
  });

  it("collapses multiple hyphens", () => {
    expect(generateSlug("a---b")).toBe("a-b");
  });

  it("handles mixed Ukrainian and Latin", () => {
    expect(generateSlug("Сток NEW")).toBe("stok-new");
  });

  it("handles empty string", () => {
    expect(generateSlug("")).toBe("");
  });

  it("generates correct slug for real product names", () => {
    expect(generateSlug("Взуття жіноче зимове")).toBe(
      "vzuttya-zhinoche-zymove",
    );
    expect(generateSlug("Іграшки дитячі")).toBe("ihrashky-dytyachi");
  });
});
