import { describe, it, expect } from "vitest";
import { messageTemplateSchema } from "./message-template";

describe("messageTemplateSchema", () => {
  it("приймає валідне тіло", () => {
    const r = messageTemplateSchema.safeParse({
      name: "Привітання",
      text: "Доброго дня! Чим можу допомогти?",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe("Привітання");
      expect(r.data.text).toBe("Доброго дня! Чим можу допомогти?");
    }
  });

  it("trim-ає назву й текст", () => {
    const r = messageTemplateSchema.safeParse({
      name: "  Знижка  ",
      text: "  Маємо акцію!  ",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe("Знижка");
      expect(r.data.text).toBe("Маємо акцію!");
    }
  });

  it("відхиляє порожню назву (після trim)", () => {
    const r = messageTemplateSchema.safeParse({ name: "   ", text: "текст" });
    expect(r.success).toBe(false);
  });

  it("відхиляє порожній текст (після trim)", () => {
    const r = messageTemplateSchema.safeParse({ name: "Назва", text: "  " });
    expect(r.success).toBe(false);
  });

  it("відхиляє відсутню назву", () => {
    const r = messageTemplateSchema.safeParse({ text: "текст" });
    expect(r.success).toBe(false);
  });

  it("відхиляє відсутній текст", () => {
    const r = messageTemplateSchema.safeParse({ name: "Назва" });
    expect(r.success).toBe(false);
  });

  it("відхиляє назву > 100 символів", () => {
    const r = messageTemplateSchema.safeParse({
      name: "x".repeat(101),
      text: "текст",
    });
    expect(r.success).toBe(false);
  });

  it("приймає назву рівно 100 символів", () => {
    const r = messageTemplateSchema.safeParse({
      name: "x".repeat(100),
      text: "текст",
    });
    expect(r.success).toBe(true);
  });

  it("відхиляє текст > 5000 символів", () => {
    const r = messageTemplateSchema.safeParse({
      name: "Назва",
      text: "y".repeat(5001),
    });
    expect(r.success).toBe(false);
  });

  it("приймає текст рівно 5000 символів", () => {
    const r = messageTemplateSchema.safeParse({
      name: "Назва",
      text: "y".repeat(5000),
    });
    expect(r.success).toBe(true);
  });

  it("відхиляє нечислові / не-рядкові типи", () => {
    expect(
      messageTemplateSchema.safeParse({ name: 5, text: "x" }).success,
    ).toBe(false);
    expect(
      messageTemplateSchema.safeParse({ name: "x", text: 5 }).success,
    ).toBe(false);
    expect(messageTemplateSchema.safeParse(null).success).toBe(false);
  });
});
