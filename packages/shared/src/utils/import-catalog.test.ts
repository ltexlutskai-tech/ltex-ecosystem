import { describe, it, expect } from "vitest";
import {
  parseNomenklatura,
  parseDescription,
  parseCategoryCell,
  classifyToken,
  slugify,
} from "./import-catalog";

describe("parseNomenklatura", () => {
  it("splits name + youtube URL + weight", () => {
    expect(parseNomenklatura("Назва, https://youtu.be/abc, 25")).toEqual({
      name: "Назва",
      videoUrl: "https://youtu.be/abc",
      weightFromName: 25,
    });
  });

  it("returns null URL/weight when only name present", () => {
    expect(parseNomenklatura("Тільки назва")).toEqual({
      name: "Тільки назва",
      videoUrl: null,
      weightFromName: null,
    });
  });

  it("preserves comma-noise inside name", () => {
    expect(
      parseNomenklatura(
        "Куртки мікс зима 1й сорт (1235), https://www.youtube.com/playlist?list=PL1, 25",
      ),
    ).toEqual({
      name: "Куртки мікс зима 1й сорт (1235)",
      videoUrl: "https://www.youtube.com/playlist?list=PL1",
      weightFromName: 25,
    });
  });

  it("parses weight ranges as the lower bound", () => {
    expect(
      parseNomenklatura("X, https://youtu.be/abc, 15-20").weightFromName,
    ).toBe(15);
  });

  it("ignores trailing units in weight", () => {
    expect(
      parseNomenklatura("X, https://youtu.be/a, 25 кг").weightFromName,
    ).toBe(25);
  });

  it("handles null/empty input", () => {
    expect(parseNomenklatura(null)).toEqual({
      name: "",
      videoUrl: null,
      weightFromName: null,
    });
    expect(parseNomenklatura("   ")).toEqual({
      name: "",
      videoUrl: null,
      weightFromName: null,
    });
  });
});

describe("parseDescription", () => {
  it("parses checklist with all fields", () => {
    const raw =
      "✔Сезон: Демісезон\r\n✔Сорт: 1й\r\n✔Стать: Жіноча\r\n✔Розміри: XS-2XL\r\n✔Кількість одиниць: 2-4 шт/кг\r\n✔Вага одиниці: 0,25-0,45 кг\r\n✔Вага лота: 25 кг";
    expect(parseDescription(raw)).toEqual({
      quality: "first",
      season: "demiseason",
      country: null,
      gender: "Жіноча",
      sizes: "XS-2XL",
      unitsPerKg: "2-4 шт/кг",
      unitWeight: "0,25-0,45 кг",
      weightLot: 25,
    });
  });

  it("parses ✔️ (with FE0F variation selector)", () => {
    const raw = "✔️Сезон: Зима \r\n✔️Сорт: Сток\r\n✔️Країна: Англія";
    expect(parseDescription(raw)).toMatchObject({
      season: "winter",
      quality: "stock",
      country: "england",
    });
  });

  it("normalizes Жіноча/Чоловіча → Унісекс", () => {
    expect(parseDescription("✔Стать: Жіноча/Чоловіча.")).toMatchObject({
      gender: "Унісекс",
    });
    expect(parseDescription("✔Стать: Чоловіча/Жіноча")).toMatchObject({
      gender: "Унісекс",
    });
  });

  it("normalizes Доросла/Дитяча → Дорослий", () => {
    expect(parseDescription("✔Стать: Доросла/Дитяча")).toMatchObject({
      gender: "Дорослий",
    });
  });

  it("returns nulls for stub descriptions (empty values)", () => {
    const stub =
      "✔Сезон: \r\n✔Сорт: \r\n✔Стать: \r\n✔Розміри:\r\n✔Кількість одиниць: \r\n✔Вага одиниці: \r\n✔Вага лота:";
    expect(parseDescription(stub)).toEqual({
      quality: null,
      season: null,
      country: null,
      gender: null,
      sizes: null,
      unitsPerKg: null,
      unitWeight: null,
      weightLot: null,
    });
  });

  it("handles null/empty input", () => {
    expect(parseDescription(null).quality).toBeNull();
    expect(parseDescription("").quality).toBeNull();
  });
});

describe("classifyToken", () => {
  it("classifies quality tokens", () => {
    expect(classifyToken("Екстра")).toMatchObject({
      kind: "quality",
      value: "extra",
    });
    expect(classifyToken("1-й сорт")).toMatchObject({
      kind: "quality",
      value: "first",
    });
    expect(classifyToken("2й сорт")).toMatchObject({
      kind: "quality",
      value: "second",
    });
    expect(classifyToken("Екстра + 1-й сорт")).toMatchObject({
      kind: "quality",
      value: "extra_first",
    });
    expect(classifyToken("Екстра+Крем")).toMatchObject({
      kind: "quality",
      value: "extra_cream",
    });
  });

  it("classifies country tokens (incl. supplier suffix)", () => {
    expect(classifyToken("Німеччина D")).toMatchObject({
      kind: "country",
      value: "germany",
    });
    expect(classifyToken("Німеччина")).toMatchObject({
      kind: "country",
      value: "germany",
    });
    expect(classifyToken("Шотландія")).toMatchObject({
      kind: "country",
      value: "scotland",
    });
    expect(classifyToken("Америка")).toMatchObject({
      kind: "country",
      value: "usa",
    });
  });

  it("folds rare European countries into germany (conservative default)", () => {
    expect(classifyToken("Бельгія")).toMatchObject({
      kind: "country",
      value: "germany",
    });
  });

  it("classifies gender tokens", () => {
    expect(classifyToken("Жіноче")).toMatchObject({
      kind: "gender",
      value: "Жіноча",
    });
    expect(classifyToken("Мікс жіноче+чоловіче")).toMatchObject({
      kind: "gender",
      value: "Унісекс",
    });
  });

  it("ignores size noise tokens", () => {
    expect(classifyToken("XXL")).toMatchObject({
      kind: "noise",
      value: "size",
    });
    expect(classifyToken("3XL")).toMatchObject({
      kind: "noise",
      value: "size",
    });
  });

  it("classifies seasons", () => {
    expect(classifyToken("Демісезон")).toMatchObject({
      kind: "season",
      value: "demiseason",
    });
    expect(classifyToken("Всесезонне")).toMatchObject({
      kind: "season",
      value: "all_season",
    });
  });

  it("falls back to category for unknown tokens", () => {
    expect(classifyToken("Светри та кардигани")).toMatchObject({
      kind: "category",
      value: "светри та кардигани",
    });
  });
});

describe("parseCategoryCell", () => {
  it("splits comma-separated tokens and classifies", () => {
    const tokens = parseCategoryCell(
      "Одяг, Светри та кардигани, Демісезон, Німеччина, Жіноче, 1-й сорт",
    );
    expect(tokens.map((t) => t.kind + ":" + t.value)).toEqual([
      "category:одяг",
      "category:светри та кардигани",
      "season:demiseason",
      "country:germany",
      "gender:Жіноча",
      "quality:first",
    ]);
  });

  it("returns empty array for null/empty", () => {
    expect(parseCategoryCell(null)).toEqual([]);
    expect(parseCategoryCell("")).toEqual([]);
    expect(parseCategoryCell("   ")).toEqual([]);
  });

  it("trims trailing/multi spaces", () => {
    const tokens = parseCategoryCell("Куртки та пальта          , Одяг");
    expect(tokens[0]?.value).toBe("куртки та пальта");
    expect(tokens[1]?.value).toBe("одяг");
  });
});

describe("slugify", () => {
  it("transliterates Cyrillic to Latin and dashes", () => {
    expect(slugify("Куртка демісезон")).toBe("kurtka-demisezon");
  });

  it("strips punctuation", () => {
    expect(slugify("Назва, з комами!")).toBe("nazva-z-komamy");
  });
});
