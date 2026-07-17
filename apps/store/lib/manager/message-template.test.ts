import { describe, it, expect } from "vitest";
import {
  canManageTemplate,
  filterTemplates,
  messageTemplateSchema,
  templateMatchesQuery,
  templateMatchesScope,
  type TemplateLike,
} from "./message-template";

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

  it("isShared дефолтиться у false, коли не задано", () => {
    const r = messageTemplateSchema.safeParse({ name: "Назва", text: "текст" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isShared).toBe(false);
  });

  it("приймає isShared=true", () => {
    const r = messageTemplateSchema.safeParse({
      name: "Назва",
      text: "текст",
      isShared: true,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isShared).toBe(true);
  });

  it("відхиляє не-булевий isShared", () => {
    expect(
      messageTemplateSchema.safeParse({ name: "x", text: "y", isShared: "yes" })
        .success,
    ).toBe(false);
  });
});

const t = (over: Partial<TemplateLike>): TemplateLike => ({
  name: "Назва",
  text: "текст",
  createdByUserId: "u1",
  isShared: false,
  ...over,
});

describe("templateMatchesScope", () => {
  it("«Мої» — власні шаблони незалежно від isShared", () => {
    expect(
      templateMatchesScope(t({ createdByUserId: "u1" }), "mine", "u1"),
    ).toBe(true);
    expect(
      templateMatchesScope(
        t({ createdByUserId: "u1", isShared: true }),
        "mine",
        "u1",
      ),
    ).toBe(true);
    expect(
      templateMatchesScope(t({ createdByUserId: "u2" }), "mine", "u1"),
    ).toBe(false);
  });

  it("«Спільні» — лише isShared від інших", () => {
    expect(
      templateMatchesScope(
        t({ createdByUserId: "u2", isShared: true }),
        "shared",
        "u1",
      ),
    ).toBe(true);
    // Власний спільний не потрапляє у «Спільні».
    expect(
      templateMatchesScope(
        t({ createdByUserId: "u1", isShared: true }),
        "shared",
        "u1",
      ),
    ).toBe(false);
    // Приватний чужий не потрапляє.
    expect(
      templateMatchesScope(
        t({ createdByUserId: "u2", isShared: false }),
        "shared",
        "u1",
      ),
    ).toBe(false);
  });

  it("легасі без автора — лише у «Спільні» (коли isShared)", () => {
    expect(
      templateMatchesScope(
        t({ createdByUserId: null, isShared: true }),
        "mine",
        "u1",
      ),
    ).toBe(false);
    expect(
      templateMatchesScope(
        t({ createdByUserId: null, isShared: true }),
        "shared",
        "u1",
      ),
    ).toBe(true);
  });
});

describe("templateMatchesQuery", () => {
  it("порожній запит матчить усе", () => {
    expect(templateMatchesQuery(t({}), "")).toBe(true);
    expect(templateMatchesQuery(t({}), "   ")).toBe(true);
  });

  it("матчить по назві (регістронезалежно)", () => {
    expect(templateMatchesQuery(t({ name: "Знижка на весну" }), "ЗНИЖКА")).toBe(
      true,
    );
  });

  it("матчить по тексту всередині шаблону", () => {
    expect(
      templateMatchesQuery(
        t({ name: "Привітання", text: "Маємо велику акцію!" }),
        "акцію",
      ),
    ).toBe(true);
  });

  it("не матчить, коли ніде немає", () => {
    expect(
      templateMatchesQuery(
        t({ name: "Привітання", text: "Доброго дня" }),
        "xyz",
      ),
    ).toBe(false);
  });
});

describe("filterTemplates", () => {
  const list: TemplateLike[] = [
    t({ name: "Моя приватна", createdByUserId: "u1", isShared: false }),
    t({ name: "Моя спільна", createdByUserId: "u1", isShared: true }),
    t({
      name: "Чужа спільна акція",
      text: "Знижки!",
      createdByUserId: "u2",
      isShared: true,
    }),
    t({ name: "Чужа приватна", createdByUserId: "u2", isShared: false }),
  ];

  it("«Мої» повертає лише власні", () => {
    const r = filterTemplates(list, { scope: "mine", userId: "u1", query: "" });
    expect(r.map((x) => x.name)).toEqual(["Моя приватна", "Моя спільна"]);
  });

  it("«Спільні» повертає лише чужі спільні", () => {
    const r = filterTemplates(list, {
      scope: "shared",
      userId: "u1",
      query: "",
    });
    expect(r.map((x) => x.name)).toEqual(["Чужа спільна акція"]);
  });

  it("вкладка + пошук працюють разом", () => {
    const r = filterTemplates(list, {
      scope: "shared",
      userId: "u1",
      query: "знижки",
    });
    expect(r.map((x) => x.name)).toEqual(["Чужа спільна акція"]);
  });
});

describe("canManageTemplate", () => {
  it("автор може керувати", () => {
    expect(
      canManageTemplate(
        { createdByUserId: "u1" },
        { id: "u1", isAdmin: false },
      ),
    ).toBe(true);
  });

  it("не-автор без прав — ні", () => {
    expect(
      canManageTemplate(
        { createdByUserId: "u2" },
        { id: "u1", isAdmin: false },
      ),
    ).toBe(false);
  });

  it("admin/owner може керувати будь-яким (у т.ч. легасі без автора)", () => {
    expect(
      canManageTemplate({ createdByUserId: "u2" }, { id: "u1", isAdmin: true }),
    ).toBe(true);
    expect(
      canManageTemplate({ createdByUserId: null }, { id: "u1", isAdmin: true }),
    ).toBe(true);
  });

  it("легасі без автора — звичайний менеджер не керує", () => {
    expect(
      canManageTemplate(
        { createdByUserId: null },
        { id: "u1", isAdmin: false },
      ),
    ).toBe(false);
  });
});
