import type { ManagerRole } from "@/lib/auth/jwt";

/**
 * Ролі, що керують каталогом у системі (товари / категорії / фото) —
 * 7.2 Блок 3, рішення user 1A: лише admin + owner + warehouse.
 * Решта менеджерів каталог лише переглядають.
 */
export const CATALOG_MANAGER_ROLES: ReadonlySet<ManagerRole> =
  new Set<ManagerRole>(["admin", "owner", "warehouse"]);

export function canManageCatalog(role: ManagerRole): boolean {
  return CATALOG_MANAGER_ROLES.has(role);
}

/**
 * Структурні дії над товаром (середня вага, категорія, фото) — лише власник
 * та адмін (рішення user 2026-07-17). Склад бачить, але не змінює.
 */
export const CATALOG_STRUCTURE_ROLES: ReadonlySet<ManagerRole> =
  new Set<ManagerRole>(["admin", "owner"]);

export function canManageCatalogStructure(role: ManagerRole): boolean {
  return CATALOG_STRUCTURE_ROLES.has(role);
}

/**
 * Редагування характеристик товару з картки — усі ролі, КРІМ торгових
 * менеджерів (рішення user 2026-07-17: менеджери лише переглядають картку).
 */
export const PRODUCT_CARD_VIEW_ONLY_ROLES: ReadonlySet<ManagerRole> =
  new Set<ManagerRole>(["manager", "senior_manager"]);

export function canEditProductCard(role: ManagerRole): boolean {
  return !PRODUCT_CARD_VIEW_ONLY_ROLES.has(role);
}
