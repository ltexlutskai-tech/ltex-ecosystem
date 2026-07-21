import { describe, expect, it } from "vitest";
import {
  buildWarehouseTasksWhere,
  buildWarehouseTasksOrderBy,
  normalizeTaskStatus,
  normalizeTaskDelivery,
  DEFAULT_WAREHOUSE_TASK_ORDER_BY,
} from "./warehouse-tasks-list";

describe("normalizeTaskStatus / normalizeTaskDelivery", () => {
  it("приймає лише allow-list", () => {
    expect(normalizeTaskStatus("received")).toBe("received");
    expect(normalizeTaskStatus("bogus")).toBe("");
    expect(normalizeTaskStatus(undefined)).toBe("");
    expect(normalizeTaskDelivery("ukrposhta")).toBe("ukrposhta");
    expect(normalizeTaskDelivery("carrier-pigeon")).toBe("");
  });
});

describe("buildWarehouseTasksWhere", () => {
  // Завжди присутній фільтр «реалізацію не видалено у себе».
  const NOT_DELETED = { sale: { markedForDeletion: false } };

  it("менеджер — обмежено своїм managerUserId", () => {
    const where = buildWarehouseTasksWhere({ managerUserId: "u1" });
    expect(where).toEqual({ AND: [NOT_DELETED, { managerUserId: "u1" }] });
  });

  it("склад/адмін (null) без фільтрів — лише виключення видалених", () => {
    expect(buildWarehouseTasksWhere({ managerUserId: null })).toEqual({
      AND: [NOT_DELETED],
    });
  });

  it("накопичує статус + доставку + пошук по клієнту", () => {
    const where = buildWarehouseTasksWhere({
      managerUserId: null,
      status: "sent",
      deliveryMethod: "post",
      customerName: "  тов  ",
    });
    expect(where).toEqual({
      AND: [
        NOT_DELETED,
        { status: "sent" },
        { deliveryMethod: "post" },
        { customerName: { contains: "тов", mode: "insensitive" } },
      ],
    });
  });

  it("ігнорує невалідні статус/доставку та порожній пошук", () => {
    const where = buildWarehouseTasksWhere({
      managerUserId: null,
      status: "xxx",
      deliveryMethod: "yyy",
      customerName: "   ",
    });
    expect(where).toEqual({ AND: [NOT_DELETED] });
  });
});

describe("buildWarehouseTasksOrderBy", () => {
  it("невідомий ключ → дефолт (статус ↑, дата ↓)", () => {
    expect(buildWarehouseTasksOrderBy(undefined, undefined)).toEqual(
      DEFAULT_WAREHOUSE_TASK_ORDER_BY,
    );
    expect(buildWarehouseTasksOrderBy("weight", "asc")).toEqual(
      DEFAULT_WAREHOUSE_TASK_ORDER_BY,
    );
  });

  it("createdAt: явний напрямок, дефолт desc", () => {
    expect(buildWarehouseTasksOrderBy("createdAt", undefined)).toEqual([
      { createdAt: "desc" },
    ]);
    expect(buildWarehouseTasksOrderBy("createdAt", "asc")).toEqual([
      { createdAt: "asc" },
    ]);
  });

  it("customerName/status: вторинне сортування по свіжості", () => {
    expect(buildWarehouseTasksOrderBy("customerName", undefined)).toEqual([
      { customerName: "asc" },
      { createdAt: "desc" },
    ]);
    expect(buildWarehouseTasksOrderBy("status", "desc")).toEqual([
      { status: "desc" },
      { createdAt: "desc" },
    ]);
  });
});
