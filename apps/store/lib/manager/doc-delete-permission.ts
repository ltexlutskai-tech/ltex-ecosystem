import type { ManagerRole } from "@/lib/auth/jwt";

/**
 * Ролі, яким дозволено ВИДАЛЯТИ менеджерські документи (Замовлення / Реалізації /
 * Оплати / Маршрутні листи).
 *
 * Видалення — деструктивна дія: проведений документ теж видаляється, але його
 * слід (рух боргу) реверсується. Тому обмежуємо колом ролей, що ведуть ці
 * документи. Складські / аналітики / бухгалтери документи не видаляють.
 *
 * Окремо від цього — per-document ownership (manager бачить/видаляє лише своїх
 * клієнтів), яку перевіряє `canViewOrder`/`canViewSale` у кожному endpoint.
 */
const DOC_DELETE_ROLES: ReadonlySet<ManagerRole> = new Set<ManagerRole>([
  "admin",
  "owner",
  "manager",
  "senior_manager",
]);

/** Чи має роль право видаляти менеджерські документи? */
export function canDeleteManagerDoc(role: ManagerRole): boolean {
  return DOC_DELETE_ROLES.has(role);
}
