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

  it("будує опис у форматі L-TEX: хештег зверху, характеристики ✅, соцмережі, штрихкод унизу", () => {
    const text = buildYoutubeDescription(
      {
        season: "Зима",
        quality: "Сток",
        unitsCount: "63",
        unitWeight: "0.22",
        lotWeightKg: 14.1,
        gender: "Жіноча",
        sizes: "S-XL",
        lotUrl: "https://new.ltex.com.ua/lot/2000141395292",
        barcode: "2000141395292",
        productName: "Куртки зимові (1676)",
        fallbackCode: null,
      },
      links,
    );

    // Хештег зверху + додаткові.
    expect(text.startsWith("#ltex1676 #секондхендоптом #стокоптом")).toBe(true);
    // Характеристики з ✅ + форматування чисел.
    expect(text).toContain("✅ Сорт: Сток");
    expect(text).toContain("✅ Кількість одиниць: 63шт");
    expect(text).toContain("✅ Вага одиниці: 0,22кг");
    expect(text).toContain("✅ Вага лота: 14,1кг");
    expect(text).toContain(
      "✅ Замовити лот: https://new.ltex.com.ua/lot/2000141395292",
    );
    expect(text).toContain("📄 Переглянути каталог:");
    expect(text).toContain("🔗 МИ В СОЦМЕРЕЖАХ:");
    expect(text).toContain("📘 Telegram: https://t.me/LTEX_Second");
    // Хештег + штрихкод унизу.
    expect(text.trim().endsWith("2000141395292")).toBe(true);
    expect(text).toContain("\n#ltex1676\n2000141395292");
  });

  it("показує всі 7 характеристик навіть коли порожні (з «-»)", () => {
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
    expect(text).toContain("✅ Сезон: -");
    expect(text).toContain("✅ Вага лота: -");
    expect(text).toContain("✅ Розміри: -");
    expect(text).toContain("#ltex0001");
  });

  it("пропускає блок соцмереж, коли посилань немає, і не лишає >2 порожніх рядків", () => {
    const text = buildYoutubeDescription(
      {
        lotUrl: "https://new.ltex.com.ua/lot/X",
        barcode: "X",
        productName: "Товар (0001)",
      },
      {}, // без жодних посилань
    );
    expect(text).not.toContain("МИ В СОЦМЕРЕЖАХ");
    expect(text).not.toMatch(/\n{3,}/);
  });
});
