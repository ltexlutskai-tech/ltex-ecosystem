import type { ManagerRole } from "@/lib/auth/jwt";

/**
 * Ролі, яким дозволено вести КАЗНАЧЕЙСЬКІ документи (Платіжки вхідні/вихідні +
 * Переміщення готівки) — і перегляд, і запис/проведення.
 *
 * Це операції з рухом грошей між касою/рахунками та безготівкові платежі, тому
 * доступ обмежено бухгалтерією та керівництвом (як у 1С — фінансовий контур).
 */
const TREASURY_ROLES: ReadonlySet<ManagerRole> = new Set<ManagerRole>([
  "admin",
  "owner",
  "bookkeeper",
]);

/** Чи має роль право працювати з казначейськими документами? */
export function canManageTreasury(role: ManagerRole): boolean {
  return TREASURY_ROLES.has(role);
}
