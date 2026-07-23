import { describe, it, expect } from "vitest";
import {
  extractArticleCode4,
  buildYoutubeDescription,
} from "./video-description";
import { defaultVideoLinkMap } from "./video-links";

describe("extractArticleCode4", () => {
  it("бере останній (NNNN) з назви", () => {
    expect(extractArticleCode4("Куртки зимові (0658)")).toBe("0658");
  });

  it("бере ОСТАННІЙ (NNNN), якщо їх кілька", () => {
    expect(extractArticleCode4("Мікс (1200) взуття (0658)")).toBe("0658");
  });

  it("фолбек на останні 4 цифри code1C, коли в назві немає (NNNN)", () => {
    expect(extractArticleCode4("Куртки зимові", "00000001358")).toBe("1358");
  });

  it("повертає порожнє, коли ніде немає цифр", () => {
    expect(extractArticleCode4("Куртки", null)).toBe("");
  });
});

describe("buildYoutubeDescription", () => {
  const links = defaultVideoLinkMap();

  it("будує опис з характеристик + посилання на лот + хештег + штрихкод", () => {
    const text = buildYoutubeDescription(
      {
        season: "Зима",
        quality: "1 сорт",
        unitsCount: "20",
        unitWeight: "0.9 кг",
        lotWeightKg: 18,
        gender: "Жіноча",
        sizes: "S-XL",
        lotUrl: "https://new.ltex.com.ua/lot/L-0658-00042",
        barcode: "L-0658-00042",
        productName: "Куртки зимові (0658)",
        fallbackCode: null,
      },
      links,
    );

    expect(text).toContain("✔️Сезон: Зима");
    expect(text).toContain("✔️Сорт: 1 сорт");
    expect(text).toContain("✔️Вага лота: 18кг");
    expect(text).toContain(
      "✅Замовити лот: https://new.ltex.com.ua/lot/L-0658-00042",
    );
    expect(text).toContain("#ltex0658");
    expect(text.trim().endsWith("L-0658-00042")).toBe(true);
  });

  it("пропускає порожні характеристики", () => {
    const text = buildYoutubeDescription(
      {
        season: "",
        quality: null,
        unitsCount: null,
        unitWeight: null,
        lotWeightKg: null,
        gender: null,
        sizes: null,
        lotUrl: "https://new.ltex.com.ua/lot/X",
        barcode: "X",
        productName: "Товар (0001)",
      },
      links,
    );
    expect(text).not.toContain("✔️Сезон");
    expect(text).not.toContain("✔️Вага лота");
    expect(text).toContain("#ltex0001");
  });

  it("не залишає >2 порожніх рядків підряд", () => {
    const text = buildYoutubeDescription(
      {
        lotUrl: "https://new.ltex.com.ua/lot/X",
        barcode: "X",
        productName: "Товар (0001)",
      },
      {}, // без жодних посилань
    );
    expect(text).not.toMatch(/\n{3,}/);
  });
});
