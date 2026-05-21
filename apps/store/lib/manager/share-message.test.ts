import { describe, it, expect } from "vitest";
import {
  buildVideoRequestText,
  buildProductShareText,
  formatEur,
  formatUahAmount,
  LTEX_CONTACTS,
} from "./share-message";

describe("buildVideoRequestText", () => {
  it("builds the exact 1С line order with all fields", () => {
    const text = buildVideoRequestText({
      articleCode: "AB-123",
      productName: "Куртки зимові мікс",
      quantity: 5,
      clientName: "ФОП Іваненко",
      clientPhone: "+380501112233",
      sellerName: "Олена Петрівна",
    });
    expect(text).toBe(
      [
        "Треба відео",
        "Артикул: AB-123",
        "Куртки зимові мікс",
        "5 шт.",
        "ФОП Іваненко",
        "+380501112233",
        "Олена Петрівна",
      ].join("\n"),
    );
  });

  it("omits empty article line", () => {
    const text = buildVideoRequestText({
      articleCode: null,
      productName: "Товар",
      quantity: 1,
      clientName: "Клієнт",
      clientPhone: "+380",
      sellerName: "Менеджер",
    });
    expect(text).not.toContain("Артикул:");
    expect(text.split("\n")[0]).toBe("Треба відео");
  });

  it("omits empty phone line", () => {
    const text = buildVideoRequestText({
      articleCode: "X",
      productName: "Товар",
      quantity: 2,
      clientName: "Клієнт",
      clientPhone: null,
      sellerName: "Менеджер",
    });
    const lines = text.split("\n");
    expect(lines).toEqual([
      "Треба відео",
      "Артикул: X",
      "Товар",
      "2 шт.",
      "Клієнт",
      "Менеджер",
    ]);
  });

  it("trims whitespace in fields", () => {
    const text = buildVideoRequestText({
      articleCode: "  A  ",
      productName: "  Назва  ",
      quantity: 3,
      clientName: "  Клієнт  ",
      clientPhone: "  +380  ",
      sellerName: "  Менеджер  ",
    });
    expect(text).toContain("Артикул: A");
    expect(text).toContain("Назва");
    expect(text).not.toContain("  ");
  });
});

describe("formatEur / formatUahAmount", () => {
  it("formats EUR with two decimals + symbol", () => {
    expect(formatEur(12.5)).toBe("12.50 €");
    expect(formatEur(7)).toBe("7.00 €");
  });

  it("rounds UAH to integer with separators", () => {
    expect(formatUahAmount(1234.6)).toBe(`${(1235).toLocaleString("uk-UA")} ₴`);
    expect(formatUahAmount(999.4)).toBe("999 ₴");
  });
});

describe("buildProductShareText", () => {
  it("includes contacts always", () => {
    const text = buildProductShareText({
      name: "Товар",
      articleCode: null,
      basePriceEur: 10,
      isNew: false,
      rateUah: 43,
    });
    expect(text).toContain(LTEX_CONTACTS.phones[0]);
    expect(text).toContain(LTEX_CONTACTS.phones[1]);
    expect(text).toContain(`Telegram: ${LTEX_CONTACTS.telegram}`);
  });

  it("adds АКЦІЯ badge + struck-through base price when sale < base", () => {
    const text = buildProductShareText({
      name: "Светри",
      articleCode: "SW-1",
      basePriceEur: 12,
      salePriceEur: 9,
      isNew: false,
      rateUah: 43,
    });
    expect(text).toContain("🔥 АКЦІЯ");
    expect(text).toContain("Акційна ціна: 9.00 €/кг (замість 12.00 €/кг)");
    expect(text).not.toContain("🆕 НОВИНКА");
  });

  it("does NOT add АКЦІЯ when sale >= base", () => {
    const text = buildProductShareText({
      name: "Товар",
      articleCode: null,
      basePriceEur: 10,
      salePriceEur: 10,
      isNew: false,
      rateUah: 43,
    });
    expect(text).not.toContain("🔥 АКЦІЯ");
    expect(text).toContain("Ціна: 10.00 €/кг");
  });

  it("adds НОВИНКА badge when isNew", () => {
    const text = buildProductShareText({
      name: "Товар",
      articleCode: null,
      basePriceEur: 10,
      isNew: true,
      rateUah: 43,
    });
    expect(text).toContain("🆕 НОВИНКА");
  });

  it("computes UAH lot cost = weight × base price × rate", () => {
    const text = buildProductShareText({
      name: "Мішок",
      articleCode: "M-1",
      basePriceEur: 5,
      isNew: false,
      lot: { weight: 20, barcode: "1234567890123" },
      rateUah: 43,
    });
    // 20 * 5 * 43 = 4300
    expect(text).toContain(
      `Вартість лоту: ≈ ${(4300).toLocaleString("uk-UA")} ₴`,
    );
    expect(text).toContain("Вага лоту: 20 кг");
    expect(text).toContain("Штрих-код: 1234567890123");
    expect(text).toContain("(за курсом 43.00)");
  });

  it("uses sale price for UAH lot cost when on sale", () => {
    const text = buildProductShareText({
      name: "Мішок",
      articleCode: "M-1",
      basePriceEur: 10,
      salePriceEur: 8,
      isNew: false,
      lot: { weight: 10, barcode: "999" },
      rateUah: 40,
    });
    // 10 * 8 * 40 = 3200 (sale price wins)
    expect(text).toContain(
      `Вартість лоту: ≈ ${(3200).toLocaleString("uk-UA")} ₴`,
    );
  });

  it("omits YouTube line when no videoUrl", () => {
    const text = buildProductShareText({
      name: "Товар",
      articleCode: null,
      basePriceEur: 10,
      isNew: false,
      rateUah: 43,
    });
    expect(text).not.toContain("▶️ Відео:");
  });

  it("includes YouTube line when videoUrl present", () => {
    const text = buildProductShareText({
      name: "Товар",
      articleCode: null,
      basePriceEur: 10,
      isNew: false,
      videoUrl: "https://youtu.be/abc",
      rateUah: 43,
    });
    expect(text).toContain("▶️ Відео: https://youtu.be/abc");
  });

  it("includes description (trimmed) when present", () => {
    const text = buildProductShareText({
      name: "Товар",
      articleCode: null,
      description: "  Гарний опис прайсу  ",
      basePriceEur: 10,
      isNew: false,
      rateUah: 43,
    });
    expect(text).toContain("Гарний опис прайсу");
  });

  it("shows the FULL description without truncation (long descriptions intact)", () => {
    const longDesc = "x".repeat(600);
    const text = buildProductShareText({
      name: "Товар",
      articleCode: null,
      description: longDesc,
      basePriceEur: 10,
      isNew: false,
      rateUah: 43,
    });
    // Повний опис присутній цілком, без обрізаючого «…».
    expect(text).toContain(longDesc);
    expect(text).not.toContain("…");
  });

  it("preserves multi-line / detailed descriptions verbatim (only .trim())", () => {
    const desc =
      "  Військовий мікс: куртки, штани, берці.\nСорт екстра.\nСклад: Європа.  ";
    const text = buildProductShareText({
      name: "Військовий мікс",
      articleCode: "MIL-1",
      description: desc,
      basePriceEur: 8,
      isNew: false,
      rateUah: 43,
    });
    expect(text).toContain(desc.trim());
  });

  it("omits price block when basePriceEur is null", () => {
    const text = buildProductShareText({
      name: "Товар",
      articleCode: null,
      basePriceEur: null,
      isNew: false,
      rateUah: 43,
    });
    expect(text).not.toContain("Ціна:");
    expect(text).not.toContain("/кг");
  });
});
