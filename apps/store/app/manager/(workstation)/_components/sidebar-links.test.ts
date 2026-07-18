import { describe, it, expect } from "vitest";
import { getSidebarSections } from "./sidebar-links";

/** Плаский набір href усіх видимих пунктів для ролі. */
function hrefs(role: Parameters<typeof getSidebarSections>[0]): Set<string> {
  return new Set(
    getSidebarSections(role)
      .flat()
      .map((l) => l.href),
  );
}

describe("getSidebarSections — доступ меню за роллю", () => {
  it("менеджер бачить рівно дозволений набір (ТЗ 2026-07-17)", () => {
    const h = hrefs("manager");
    const allowed = [
      "/manager", // Робочий стіл
      "/manager/orders",
      "/manager/sales",
      "/manager/payments",
      "/manager/routes",
      "/manager/customers",
      "/manager/prices",
      "/manager/message-templates",
      "/manager/reminders",
      "/manager/closures",
      "/manager/chat",
      "/manager/messenger",
      "/manager/tasks", // Завдання (доручення + складські)
      "/manager/reports/manager", // Звіти (власний звіт менеджера)
      "/manager/trash", // Кошик
      "/manager/settings",
    ];
    for (const href of allowed) expect(h.has(href), href).toBe(true);
  });

  it("менеджер НЕ бачить заборонені блоки", () => {
    const h = hrefs("manager");
    const denied = [
      "/manager/presentations",
      "/manager/categories",
      "/manager/needs",
      "/manager/registry",
      "/manager/reports",
      "/manager/receivings",
      "/manager/bag-state-changes",
      "/manager/bank-payments-incoming",
      "/manager/cash-transfers",
      "/manager/admin/users",
      "/manager/admin/permissions",
    ];
    for (const href of denied) expect(h.has(href), href).toBe(false);
  });

  it("admin бачить усе (адмінка, звіти, фінанси, довідники)", () => {
    const h = hrefs("admin");
    for (const href of [
      "/manager/admin/users",
      "/manager/admin/permissions",
      "/manager/reports",
      "/manager/registry",
      "/manager/bank-payments-incoming",
      "/manager/categories",
    ]) {
      expect(h.has(href), href).toBe(true);
    }
  });

  it("owner бачить звіти, фінанси та адмін-розділи (крім Користувачів)", () => {
    const h = hrefs("owner");
    expect(h.has("/manager/reports")).toBe(true);
    expect(h.has("/manager/bank-payments-incoming")).toBe(true);
    expect(h.has("/manager/admin/permissions")).toBe(true);
    // Користувачі — лише admin.
    expect(h.has("/manager/admin/users")).toBe(false);
  });

  it("порожні секції відкидаються (немає undefined-розділювачів)", () => {
    for (const role of ["manager", "admin", "owner", "warehouse"] as const) {
      const sections = getSidebarSections(role);
      for (const s of sections) expect(s.length).toBeGreaterThan(0);
    }
  });
});
