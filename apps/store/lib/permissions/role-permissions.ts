/**
 * Матриця дозволів (Permissions Matrix) — Тиждень 1 блоку Ролі.
 *
 * Кожна роль має свій набір дозволів по ресурсах системи. Перевірка прав
 * робиться через helpers `canView/canCreate/canEdit/canDelete` нижче. Це
 * **єдине джерело правди** для гардів у API endpoints, у UI (sidebar/buttons)
 * та у автоматичних тестах.
 *
 * Філософія:
 *   - `admin`/`owner` — повний доступ, але дії `owner` додатково логуються
 *     як `isOwnerAction=true` для прозорості перед командою.
 *   - `manager` — оперативна робота тільки зі своїми клієнтами і замовленнями.
 *   - `supervisor` — як `manager`, але видимість усіх клієнтів і всіх
 *     замовлень (read), а Telegram-сповіщення про прострочені — на нього.
 *   - `analyst` — read-only до фінансів і всієї історії + експорт у Excel.
 *   - `warehouse` — поступлення товарів (приймає, генерує лоти) + збірка
 *     замовлень (без цін закупки і маржі).
 *   - `bookkeeper` — каса/банк/оплати, без редагування товарів/клієнтів.
 *
 * Дозволи per-user можуть бути перевизначені у `User.permissions JSON` —
 * це робить admin через `/manager/admin/users/[id]/permissions`. Без оверрайду
 * — успадковуються з матриці ролі.
 */

import type { ManagerRole } from "@/lib/auth/jwt";

// ─── Ресурси системи ───────────────────────────────────────────────────────
// Узгоджено з 1С-вкладками (`docs/1c-export-2026-06-02/`).
export const RESOURCES = [
  "clients", // Контрагенти (картка клієнта, список)
  "orders", // Замовлення покупців (ЗаказПокупателя)
  "sales", // Реалізації (РеализацияТоваровУслуг)
  "payments", // Оплати + каса (ПКО/РКО)
  "route_sheets", // Маршрутні листи (МаршрутныйЛист)
  "prices", // Прайс (read + менеджерські поля лоту)
  "products", // Номенклатура — admin/warehouse редагує
  "lots", // Лоти-мішки
  "receivings", // Поступлення товарів (ПоступленняТоварівУслуг) — warehouse
  "repackings", // Перепаковки (Перепаковка)
  "categories", // Категорії номенклатури
  "suppliers", // Постачальники + закупки
  "reminders", // Нагадування
  "presentations", // Презентації клієнтів
  "chat", // Чат-inbox (Viber/Telegram/Instagram/WhatsApp)
  "reports", // Звіти + аналітика
  "finance", // Маржа / прибуток / собівартість / ціни закупки
  "users", // Користувачі системи
  "permissions", // Сама матриця прав (тільки admin)
  "settings", // Налаштування системи
  "audit_log", // Журнал дій
  "exchange_rates", // Курси валют
] as const;
export type Resource = (typeof RESOURCES)[number];

// ─── Дії над ресурсом ──────────────────────────────────────────────────────
export const ACTIONS = ["view", "create", "edit", "delete", "export"] as const;
export type Action = (typeof ACTIONS)[number];

// ─── Scope для view/edit (own vs all) ──────────────────────────────────────
// 'all' = бачить/редагує усе, 'mine' = тільки свої записи (де він агент),
// 'none' = немає доступу.
export type Scope = "all" | "mine" | "none";

// ─── Permission entry ──────────────────────────────────────────────────────
export interface ResourcePermission {
  view: Scope;
  create: boolean;
  edit: Scope;
  delete: Scope;
  /** Можливість експорту у Excel/CSV (для analyst/admin/owner). */
  export: boolean;
}

export const NO_ACCESS: ResourcePermission = {
  view: "none",
  create: false,
  edit: "none",
  delete: "none",
  export: false,
};

export const FULL_ACCESS: ResourcePermission = {
  view: "all",
  create: true,
  edit: "all",
  delete: "all",
  export: true,
};

export const READ_ONLY_ALL: ResourcePermission = {
  view: "all",
  create: false,
  edit: "none",
  delete: "none",
  export: true,
};

export const READ_ONLY_NO_EXPORT: ResourcePermission = {
  view: "all",
  create: false,
  edit: "none",
  delete: "none",
  export: false,
};

export const MINE_ONLY: ResourcePermission = {
  view: "mine",
  create: true,
  edit: "mine",
  delete: "mine",
  export: false,
};

// ─── Матриця ролі → дозволи ────────────────────────────────────────────────
// Перевага читання: формат `Record<Resource, ResourcePermission>` — детальний
// тип-чекер ловить пропущені ресурси при додаванні нових.
export type RolePermissions = Record<Resource, ResourcePermission>;

function fillResources(
  partial: Partial<RolePermissions>,
  defaultPerm: ResourcePermission = NO_ACCESS,
): RolePermissions {
  const out = {} as RolePermissions;
  for (const r of RESOURCES) {
    out[r] = partial[r] ?? defaultPerm;
  }
  return out;
}

export const ROLE_PERMISSIONS: Record<ManagerRole, RolePermissions> = {
  // ── admin: повний доступ ───────────────────────────────────────────────
  admin: fillResources({}, FULL_ACCESS),

  // ── owner: повний доступ, але all-actions логуються як isOwnerAction ───
  owner: fillResources({}, FULL_ACCESS),

  // ── manager: оперативна робота зі своїми клієнтами + базовий перегляд ──
  manager: fillResources({
    clients: MINE_ONLY,
    orders: MINE_ONLY,
    sales: MINE_ONLY,
    payments: MINE_ONLY,
    route_sheets: MINE_ONLY,
    prices: READ_ONLY_NO_EXPORT,
    products: READ_ONLY_NO_EXPORT,
    lots: READ_ONLY_NO_EXPORT,
    categories: READ_ONLY_NO_EXPORT,
    reminders: MINE_ONLY,
    presentations: MINE_ONLY,
    chat: MINE_ONLY,
    exchange_rates: READ_ONLY_NO_EXPORT,
  }),

  // ── senior_manager: legacy, прирівнюємо до supervisor ──────────────────
  senior_manager: fillResources({
    clients: {
      view: "all",
      create: true,
      edit: "mine",
      delete: "none",
      export: false,
    },
    orders: {
      view: "all",
      create: true,
      edit: "mine",
      delete: "none",
      export: true,
    },
    sales: {
      view: "all",
      create: true,
      edit: "mine",
      delete: "none",
      export: true,
    },
    payments: {
      view: "all",
      create: true,
      edit: "mine",
      delete: "none",
      export: true,
    },
    route_sheets: {
      view: "all",
      create: true,
      edit: "mine",
      delete: "none",
      export: true,
    },
    prices: READ_ONLY_NO_EXPORT,
    products: READ_ONLY_NO_EXPORT,
    lots: READ_ONLY_NO_EXPORT,
    categories: READ_ONLY_NO_EXPORT,
    reminders: MINE_ONLY,
    presentations: MINE_ONLY,
    chat: MINE_ONLY,
    reports: READ_ONLY_ALL,
    exchange_rates: READ_ONLY_NO_EXPORT,
  }),

  // ── supervisor: видимість усього + керування — як senior_manager ───────
  supervisor: fillResources({
    clients: {
      view: "all",
      create: true,
      edit: "mine",
      delete: "none",
      export: false,
    },
    orders: {
      view: "all",
      create: true,
      edit: "mine",
      delete: "none",
      export: true,
    },
    sales: {
      view: "all",
      create: true,
      edit: "mine",
      delete: "none",
      export: true,
    },
    payments: {
      view: "all",
      create: true,
      edit: "mine",
      delete: "none",
      export: true,
    },
    route_sheets: {
      view: "all",
      create: true,
      edit: "mine",
      delete: "none",
      export: true,
    },
    prices: READ_ONLY_NO_EXPORT,
    products: READ_ONLY_NO_EXPORT,
    lots: READ_ONLY_NO_EXPORT,
    categories: READ_ONLY_NO_EXPORT,
    reminders: {
      view: "all",
      create: true,
      edit: "mine",
      delete: "mine",
      export: false,
    },
    presentations: MINE_ONLY,
    chat: {
      view: "all",
      create: true,
      edit: "mine",
      delete: "none",
      export: false,
    },
    reports: READ_ONLY_ALL,
    exchange_rates: READ_ONLY_NO_EXPORT,
  }),

  // ── analyst: read-only до всього + експорти ────────────────────────────
  analyst: fillResources({
    clients: READ_ONLY_ALL,
    orders: READ_ONLY_ALL,
    sales: READ_ONLY_ALL,
    payments: READ_ONLY_ALL,
    route_sheets: READ_ONLY_ALL,
    prices: READ_ONLY_ALL,
    products: READ_ONLY_ALL,
    lots: READ_ONLY_ALL,
    receivings: READ_ONLY_ALL,
    repackings: READ_ONLY_ALL,
    categories: READ_ONLY_NO_EXPORT,
    suppliers: READ_ONLY_ALL,
    reports: {
      view: "all",
      create: true,
      edit: "all",
      delete: "mine",
      export: true,
    },
    finance: READ_ONLY_ALL,
    exchange_rates: READ_ONLY_NO_EXPORT,
  }),

  // ── warehouse: поступлення + збірка, без цін закупки і маржі ───────────
  warehouse: fillResources({
    products: READ_ONLY_NO_EXPORT,
    lots: {
      view: "all",
      create: true,
      edit: "all",
      delete: "none",
      export: false,
    },
    receivings: {
      view: "all",
      create: true,
      edit: "all",
      delete: "none",
      export: false,
    },
    repackings: {
      view: "all",
      create: true,
      edit: "all",
      delete: "none",
      export: false,
    },
    categories: READ_ONLY_NO_EXPORT,
    suppliers: READ_ONLY_NO_EXPORT,
    orders: READ_ONLY_NO_EXPORT, // бачить активні щоб готувати, не редагує
    route_sheets: {
      view: "all",
      create: false,
      edit: "all",
      delete: "none",
      export: false,
    }, // редагує статус відвантажено
    prices: READ_ONLY_NO_EXPORT, // без цін закупки/маржі
    exchange_rates: READ_ONLY_NO_EXPORT,
  }),

  // ── bookkeeper: каса/банк/оплати ───────────────────────────────────────
  bookkeeper: fillResources({
    payments: {
      view: "all",
      create: true,
      edit: "all",
      delete: "none",
      export: true,
    },
    sales: READ_ONLY_ALL, // бачить, бо оплати йдуть проти реалізацій
    clients: {
      view: "all",
      create: false,
      edit: "all",
      delete: "none",
      export: true,
    }, // редагує борги, реквізити
    orders: READ_ONLY_NO_EXPORT,
    route_sheets: READ_ONLY_ALL,
    reports: READ_ONLY_ALL,
    finance: {
      view: "all",
      create: false,
      edit: "all",
      delete: "none",
      export: true,
    },
    exchange_rates: {
      view: "all",
      create: true,
      edit: "all",
      delete: "none",
      export: false,
    },
  }),
};

// ─── Helpers ───────────────────────────────────────────────────────────────

export interface PermissionUser {
  role: ManagerRole;
  /** Per-user override з `User.permissions` JSONB (null коли стандартний). */
  permissions?: Partial<RolePermissions> | null;
}

function getEffective(
  user: PermissionUser,
  resource: Resource,
): ResourcePermission {
  // Per-user override з User.permissions, інакше дефолт ролі.
  const override = user.permissions?.[resource];
  if (override) return override;
  return ROLE_PERMISSIONS[user.role][resource];
}

export function canView(
  user: PermissionUser,
  resource: Resource,
): { allowed: boolean; scope: Scope } {
  const p = getEffective(user, resource);
  return { allowed: p.view !== "none", scope: p.view };
}

export function canCreate(user: PermissionUser, resource: Resource): boolean {
  return getEffective(user, resource).create === true;
}

export function canEdit(
  user: PermissionUser,
  resource: Resource,
  /** ownership: чи поточний user — власник цього запису (для scope='mine'). */
  isOwner?: boolean,
): boolean {
  const p = getEffective(user, resource);
  if (p.edit === "all") return true;
  if (p.edit === "mine") return isOwner === true;
  return false;
}

export function canDelete(
  user: PermissionUser,
  resource: Resource,
  isOwner?: boolean,
): boolean {
  const p = getEffective(user, resource);
  if (p.delete === "all") return true;
  if (p.delete === "mine") return isOwner === true;
  return false;
}

export function canExport(user: PermissionUser, resource: Resource): boolean {
  return getEffective(user, resource).export === true;
}

/**
 * Чи ця дія потребує позначки `isOwnerAction` у audit_log.
 * true тільки для role='owner' (за рішенням user 2026-06-02).
 */
export function isOwnerActionRole(role: ManagerRole): boolean {
  return role === "owner";
}
