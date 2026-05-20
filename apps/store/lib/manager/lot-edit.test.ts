import { describe, it, expect } from "vitest";
import {
  MANAGER_EDITABLE_LOT_FIELDS,
  lotPatchSchema,
  pickEditableLotData,
} from "./lot-edit";

describe("MANAGER_EDITABLE_LOT_FIELDS", () => {
  it("містить рівно 6 дозволених менеджерських полів", () => {
    expect([...MANAGER_EDITABLE_LOT_FIELDS]).toEqual([
      "sector",
      "isOpen",
      "comment",
      "description",
      "isTarget",
      "videoDate",
    ]);
  });

  it("НЕ містить полів з 1С (weight/quantity/status/barcode/arrivalDate)", () => {
    const forbidden = [
      "weight",
      "quantity",
      "status",
      "barcode",
      "arrivalDate",
      "priceEur",
      "videoUrl",
    ];
    for (const f of forbidden) {
      expect(MANAGER_EDITABLE_LOT_FIELDS).not.toContain(f);
    }
  });
});

describe("lotPatchSchema", () => {
  it("приймає валідне часткове тіло", () => {
    const r = lotPatchSchema.safeParse({ sector: "A-12", isOpen: true });
    expect(r.success).toBe(true);
  });

  it("strip-ає невідомі поля (weight/status/barcode тощо)", () => {
    const r = lotPatchSchema.safeParse({
      sector: "A-1",
      weight: 99,
      status: "sold",
      barcode: "HACK",
      arrivalDate: "2026-01-01T00:00:00.000Z",
      priceEur: 1,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).not.toHaveProperty("weight");
      expect(r.data).not.toHaveProperty("status");
      expect(r.data).not.toHaveProperty("barcode");
      expect(r.data).not.toHaveProperty("arrivalDate");
      expect(r.data).not.toHaveProperty("priceEur");
      expect(r.data.sector).toBe("A-1");
    }
  });

  it("trim-ає текст і порожній рядок → null", () => {
    const r = lotPatchSchema.safeParse({ sector: "   ", comment: "  hi  " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sector).toBeNull();
      expect(r.data.comment).toBe("hi");
    }
  });

  it("приймає null для nullable-полів", () => {
    const r = lotPatchSchema.safeParse({ comment: null, description: null });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.comment).toBeNull();
      expect(r.data.description).toBeNull();
    }
  });

  it("відхиляє занадто довгий sector (>100)", () => {
    const r = lotPatchSchema.safeParse({ sector: "x".repeat(101) });
    expect(r.success).toBe(false);
  });

  it("відхиляє isOpen не-boolean", () => {
    const r = lotPatchSchema.safeParse({ isOpen: "yes" });
    expect(r.success).toBe(false);
  });

  it("приймає ISO-дату й порожній рядок для videoDate", () => {
    const iso = new Date("2026-05-20T00:00:00.000Z").toISOString();
    expect(lotPatchSchema.safeParse({ videoDate: iso }).success).toBe(true);
    expect(lotPatchSchema.safeParse({ videoDate: "" }).success).toBe(true);
    expect(lotPatchSchema.safeParse({ videoDate: null }).success).toBe(true);
    expect(lotPatchSchema.safeParse({ videoDate: "2026" }).success).toBe(false);
  });
});

describe("pickEditableLotData", () => {
  it("повертає тільки присутні дозволені поля (часткове оновлення)", () => {
    const data = pickEditableLotData({ sector: "B-2", isTarget: true });
    expect(Object.keys(data).sort()).toEqual(["isTarget", "sector"]);
    expect(data.sector).toBe("B-2");
    expect(data.isTarget).toBe(true);
  });

  it("порожній вхід → порожній update", () => {
    expect(pickEditableLotData({})).toEqual({});
  });

  it("конвертує videoDate ISO у Date, порожнє/null → null", () => {
    const iso = new Date("2026-05-20T00:00:00.000Z").toISOString();
    expect(pickEditableLotData({ videoDate: iso }).videoDate).toBeInstanceOf(
      Date,
    );
    expect(pickEditableLotData({ videoDate: "" }).videoDate).toBeNull();
    expect(pickEditableLotData({ videoDate: null }).videoDate).toBeNull();
  });

  it("передає null для nullable-текстів", () => {
    const data = pickEditableLotData({ comment: null, description: null });
    expect(data.comment).toBeNull();
    expect(data.description).toBeNull();
  });

  it("ніколи не повертає заборонені ключі навіть якщо протиснути через каст", () => {
    // Симулюємо «брудний» вхід — як якби заборонене поле прослизнуло у тип.
    const dirty = {
      sector: "A-1",
      weight: 999,
      status: "sold",
      barcode: "HACK",
    } as unknown as Parameters<typeof pickEditableLotData>[0];
    const data = pickEditableLotData(dirty);
    expect(data).not.toHaveProperty("weight");
    expect(data).not.toHaveProperty("status");
    expect(data).not.toHaveProperty("barcode");
    expect(data.sector).toBe("A-1");
  });
});
