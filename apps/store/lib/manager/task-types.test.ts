import { describe, it, expect } from "vitest";
import {
  isAssignee,
  normalizeTask,
  normalizeWarehouseTask,
  taskMatchesQuery,
  taskTypeMeta,
  type RawTask,
  type RawWarehouseTask,
  type Viewer,
} from "./task-types";

const viewerAssignee: Viewer = { id: "mgr", role: "manager" };

const base: RawTask = {
  id: "t1",
  title: "Обдзвонити клієнтів",
  description: "Запропонувати новий сток",
  type: "manual",
  status: "open",
  resultComment: null,
  completedAt: null,
  createdAt: new Date("2026-07-18T10:00:00Z"),
  createdByUserId: "boss",
  createdByName: "Власник",
  assigneeUserId: "mgr",
  assigneeRole: null,
  assigneeName: "Менеджер",
  archivedByName: null,
  clientId: null,
  saleId: null,
};

describe("isAssignee", () => {
  it("особистий виконавець", () => {
    expect(isAssignee(base, { id: "mgr", role: "manager" })).toBe(true);
    expect(isAssignee(base, { id: "other", role: "manager" })).toBe(false);
  });
  it("виконавець за роллю", () => {
    const r: RawTask = {
      ...base,
      assigneeUserId: null,
      assigneeRole: "warehouse",
    };
    expect(isAssignee(r, { id: "x", role: "warehouse" })).toBe(true);
    expect(isAssignee(r, { id: "x", role: "manager" })).toBe(false);
  });
});

describe("normalizeTask", () => {
  it("виконавець відкритого завдання може закрити", () => {
    const c = normalizeTask(base, { id: "mgr", role: "manager" });
    expect(c.canComplete).toBe(true);
    expect(c.canReopen).toBe(false);
    expect(c.assigneeName).toBe("Менеджер");
  });
  it("постановник закритого завдання може перевідкрити", () => {
    const done: RawTask = {
      ...base,
      status: "done",
      completedAt: new Date("2026-07-18T12:00:00Z"),
      resultComment: "Готово",
    };
    const c = normalizeTask(done, { id: "boss", role: "owner" });
    expect(c.canReopen).toBe(true);
    expect(c.canComplete).toBe(false);
    expect(c.completedAt).toBe("2026-07-18T12:00:00.000Z");
  });
  it("сторонній не може ні закрити, ні перевідкрити", () => {
    const c = normalizeTask(base, { id: "stranger", role: "manager" });
    expect(c.canComplete).toBe(false);
    expect(c.canReopen).toBe(false);
  });
});

describe("normalizeTask — вилучення / архів (права)", () => {
  it("постановник може вилучити й архівувати; виконавець — лише архівувати", () => {
    const creator = normalizeTask(base, { id: "boss", role: "owner" });
    expect(creator.canDelete).toBe(true);
    expect(creator.canArchive).toBe(true);

    const executor = normalizeTask(base, { id: "mgr", role: "manager" });
    expect(executor.canDelete).toBe(false);
    expect(executor.canArchive).toBe(true);
  });

  it("сторонній без ролі admin/owner не може ні вилучити, ні архівувати", () => {
    const c = normalizeTask(base, { id: "stranger", role: "manager" });
    expect(c.canDelete).toBe(false);
    expect(c.canArchive).toBe(false);
    expect(c.canUnarchive).toBe(false);
  });

  it("admin/owner має повний доступ навіть до чужого завдання", () => {
    const c = normalizeTask(base, { id: "admin1", role: "admin" });
    expect(c.canDelete).toBe(true);
    expect(c.canArchive).toBe(true);
  });

  it("архівне завдання: статус archived, показ архіватора, можна відновити", () => {
    const arch: RawTask = {
      ...base,
      status: "archived",
      archivedByName: "Власник",
    };
    const c = normalizeTask(arch, { id: "mgr", role: "manager" });
    expect(c.status).toBe("archived");
    expect(c.archivedByName).toBe("Власник");
    expect(c.canUnarchive).toBe(true);
    // Архівне не можна архівувати повторно / закрити.
    expect(c.canArchive).toBe(false);
    expect(c.canComplete).toBe(false);
  });
});

describe("normalizeWarehouseTask", () => {
  const w: RawWarehouseTask = {
    id: "w1",
    customerName: "ТОВ Ромашка",
    status: "new",
    deliveryLabel: "Нова Пошта",
    comment: null,
    managerUserId: "mgr",
    managerName: "Бойко Катерина",
    createdAt: new Date("2026-07-18T09:00:00Z"),
  };
  it("нове → open, sent → done; deep-link на детальну", () => {
    const open = normalizeWarehouseTask(w);
    expect(open.status).toBe("open");
    expect(open.href).toBe("/manager/warehouse-tasks/w1");
    expect(open.assigneeName).toBe("Склад");
    expect(open.title).toContain("ТОВ Ромашка");
    const sent = normalizeWarehouseTask({ ...w, status: "sent" });
    expect(sent.status).toBe("done");
  });
  it("складські картки не мають архіву/виконання зі списку", () => {
    const c = normalizeWarehouseTask(w);
    expect(c.canComplete).toBe(false);
    expect(c.canArchive).toBe(false);
    expect(c.canUnarchive).toBe(false);
  });
  it("вилучати може менеджер реалізації або admin/owner", () => {
    // Без viewer (легасі-виклик) — заборонено.
    expect(normalizeWarehouseTask(w).canDelete).toBe(false);
    // Менеджер реалізації (створив завдання проведенням) — може.
    expect(
      normalizeWarehouseTask(w, { id: "mgr", role: "manager" }).canDelete,
    ).toBe(true);
    // Інший менеджер — ні.
    expect(
      normalizeWarehouseTask(w, { id: "other", role: "manager" }).canDelete,
    ).toBe(false);
    // Admin/owner — можуть будь-яке.
    expect(
      normalizeWarehouseTask(w, { id: "x", role: "admin" }).canDelete,
    ).toBe(true);
    expect(
      normalizeWarehouseTask(w, { id: "x", role: "owner" }).canDelete,
    ).toBe(true);
    // Завдання без менеджера — лише admin/owner.
    expect(
      normalizeWarehouseTask(
        { ...w, managerUserId: null },
        {
          id: "mgr",
          role: "manager",
        },
      ).canDelete,
    ).toBe(false);
  });
});

describe("taskMatchesQuery", () => {
  const card = normalizeTask(base, viewerAssignee);
  it("порожній запит матчить усе", () => {
    expect(taskMatchesQuery(card, "")).toBe(true);
    expect(taskMatchesQuery(card, "   ")).toBe(true);
  });
  it("частина рядка у назві/описі, без регістру", () => {
    expect(taskMatchesQuery(card, "обдзвон")).toBe(true);
    expect(taskMatchesQuery(card, "НОВИЙ СТОК")).toBe(true);
    expect(taskMatchesQuery(card, "немає такого")).toBe(false);
  });
  it("матчить постановника/виконавця/тип", () => {
    expect(taskMatchesQuery(card, "власник")).toBe(true);
    expect(taskMatchesQuery(card, "менеджер")).toBe(true);
    expect(taskMatchesQuery(card, "доручення")).toBe(true);
  });
  it("кілька слів — усі мають зустрітись (у різних полях)", () => {
    expect(taskMatchesQuery(card, "обдзвонити власник")).toBe(true);
    expect(taskMatchesQuery(card, "обдзвонити відпустка")).toBe(false);
  });
  it("шукає й у результаті виконання", () => {
    const done = normalizeTask(
      { ...base, status: "done", resultComment: "троє замовили" },
      viewerAssignee,
    );
    expect(taskMatchesQuery(done, "троє")).toBe(true);
  });
  it("складська картка — по клієнту/менеджеру", () => {
    const wh = normalizeWarehouseTask({
      id: "w1",
      customerName: "ТОВ Ромашка",
      status: "new",
      deliveryLabel: "Нова Пошта",
      comment: null,
      managerUserId: "mgr",
      managerName: "Бойко Катерина",
      createdAt: new Date("2026-07-18T09:00:00Z"),
    });
    expect(taskMatchesQuery(wh, "ромашка")).toBe(true);
    expect(taskMatchesQuery(wh, "бойко")).toBe(true);
    expect(taskMatchesQuery(wh, "нова пошта")).toBe(true);
  });
});

describe("taskTypeMeta", () => {
  it("кольори за типом", () => {
    expect(taskTypeMeta("manual").color).toBe("blue");
    expect(taskTypeMeta("warehouse").color).toBe("amber");
    expect(taskTypeMeta("xxx").color).toBe("gray");
  });
});
