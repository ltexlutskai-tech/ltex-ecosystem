import {
  ADMIN_AUDIT_LINK,
  ADMIN_PERMISSIONS_LINK,
  ADMIN_REGION_AGENTS_LINK,
  ADMIN_USERS_LINK,
  CHAT_LINK,
  PRIMARY_LINKS,
  REGISTRY_LINK,
  REPORTS_LINK,
  SECONDARY_LINKS,
  SETTINGS_LINK,
  WAREHOUSE_RECEIVINGS_LINK,
  type SidebarLink,
} from "../sidebar-links";

/**
 * Усі відомі блоки (з sidebar-links) для матчингу шляху → людська назва.
 * Сортуємо за довжиною href спадно, щоб довші (специфічніші) префікси
 * мали пріоритет над коротшими (напр. /manager/admin/users перед /manager).
 */
const ALL_LINKS: readonly SidebarLink[] = [
  ...PRIMARY_LINKS,
  ...SECONDARY_LINKS,
  CHAT_LINK,
  ADMIN_USERS_LINK,
  ADMIN_REGION_AGENTS_LINK,
  REGISTRY_LINK,
  REPORTS_LINK,
  WAREHOUSE_RECEIVINGS_LINK,
  ADMIN_AUDIT_LINK,
  ADMIN_PERMISSIONS_LINK,
  SETTINGS_LINK,
];

const SORTED_LINKS = [...ALL_LINKS].sort(
  (a, b) => b.href.length - a.href.length,
);

/** Прибрати query/hash і нормалізувати trailing slash. */
function normalizePath(path: string): string {
  const noQuery = path.split(/[?#]/)[0] ?? path;
  if (noQuery.length > 1 && noQuery.endsWith("/")) {
    return noQuery.slice(0, -1);
  }
  return noQuery;
}

/**
 * Чиста функція: внутрішній шлях `/manager/...` → людська назва вкладки.
 *
 * - Точний матч блоку (`/manager/orders` → «Замовлення»).
 * - Деталь-сторінка (`/manager/orders/123` → «Замовлення») через префікс.
 * - Дашборд (`/manager` → «Робочий стіл»).
 * - Fallback — останній сегмент шляху, інакше «Сторінка».
 */
export function tabLabelForPath(path: string): string {
  const clean = normalizePath(path);

  // Точний матч кореня дашборда.
  if (clean === "/manager") {
    return "Робочий стіл";
  }

  for (const link of SORTED_LINKS) {
    if (link.href === "/manager") continue; // дашборд обробили вище
    if (clean === link.href || clean.startsWith(`${link.href}/`)) {
      return link.label;
    }
  }

  const segments = clean.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  return last && last !== "manager" ? last : "Сторінка";
}
