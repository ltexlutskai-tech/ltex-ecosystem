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

  it("склад бачить рівно дозволений набір блоків (2026-07-22)", () => {
    const h = hrefs("warehouse");
    const allowed = [
      "/manager", // Робочий стіл
      "/manager/routes", // Маршрут
      "/manager/tasks", // Завдання
      "/manager/reminders", // Нагадування
      "/manager/receivings", // Поступлення
      "/manager/stock-documents/repackings", // Перепаковка
      "/manager/stock-documents/inventories", // Інвентаризація
      "/manager/bag-state-changes", // Зміна стану мішка
      "/manager/np-registers", // Реєстри НП
      "/manager/reports/stock-balance", // Залишки складу
      "/manager/prices", // Прайс
      "/manager/messenger", // Чат L-TEX
      "/manager/trash", // Кошик
      "/manager/settings", // Налаштування
    ];
    for (const href of allowed) expect(h.has(href), href).toBe(true);
    // Рівно дозволений набір — жодного зайвого блоку.
    expect(h.size).toBe(allowed.length);
  });

  it("відеозона бачить лише свій вузький набір блоків (2026-07-23)", () => {
    const h = hrefs("videozone");
    const allowed = [
      "/manager", // Робочий стіл
      "/manager/video-tasks", // Відеозавдання
      "/manager/bag-state-changes", // Зміна стану мішка
      "/manager/reminders", // Нагадування
      "/manager/prices", // Прайс
      "/manager/messenger", // Чат LTEX
      "/manager/settings", // Налаштування
    ];
    for (const href of allowed) expect(h.has(href), href).toBe(true);
    expect(h.size).toBe(allowed.length);
    // Не бачить фінансів/адмінки/замовлень.
    expect(h.has("/manager/orders")).toBe(false);
    expect(h.has("/manager/admin/users")).toBe(false);
  });

  it("склад НЕ бачить менеджерські/адмін/фінансові блоки", () => {
    const h = hrefs("warehouse");
    const denied = [
      "/manager/orders",
      "/manager/sales",
      "/manager/payments",
      "/manager/customers",
      "/manager/chat", // Месенджери (зовнішні) — не Чат L-TEX
      "/manager/reports", // хаб звітів (лише stock-balance)
      "/manager/registry",
      "/manager/bank-payments-incoming",
      "/manager/admin/users",
      "/manager/stock-documents", // хаб документів — недоступний
    ];
    for (const href of denied) expect(h.has(href), href).toBe(false);
  });

  it("порожні секції відкидаються (немає undefined-розділювачів)", () => {
    for (const role of ["manager", "admin", "owner", "warehouse"] as const) {
      const sections = getSidebarSections(role);
      for (const s of sections) expect(s.length).toBeGreaterThan(0);
    }
  });
});
