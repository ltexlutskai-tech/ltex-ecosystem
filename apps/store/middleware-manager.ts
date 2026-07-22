import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, type ManagerRole } from "@/lib/auth/jwt";
import { MANAGER_ACCESS_COOKIE } from "@/lib/auth/manager-auth";
import { tryRefreshSession } from "@/lib/auth/session-refresh";

const PUBLIC_PATHS = [
  "/manager/login",
  "/manager/forgot",
  "/manager/reset",
] as const;

function isPublic(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Заборонені розділи меню за роллю (ТЗ 2026-07-17). Не лише ховаємо пункт у
 * меню — а й блокуємо прямий перехід за URL (справжній RBAC). Наразі звужуємо
 * ЛИШЕ роль `manager`; інші ролі уточнимо пізніше. Ключ = роль, значення =
 * префікси шляхів, до яких доступ заборонено (редірект на /manager).
 *
 * Порожні розділи для менеджера: Категорії, Потреби, Довідники та регістри,
 * Презентації, Звіти (2-й етап), склад (Поступлення/Зміна стану), фінанси,
 * адмінка.
 */
const DENIED_PREFIXES: Partial<Record<ManagerRole, readonly string[]>> = {
  manager: [
    "/manager/categories",
    "/manager/needs",
    "/manager/registry",
    "/manager/presentations",
    "/manager/reports",
    "/manager/receivings",
    "/manager/bag-state-changes",
    "/manager/bank-payments-incoming",
    "/manager/bank-payments-outgoing",
    "/manager/cash-transfers",
    "/manager/admin",
  ],
};

/**
 * Allow-list ролей (2026-07-22). Якщо роль присутня тут — дозволено ЛИШЕ
 * перелічені префікси (+ корінь `/manager`), усе інше редіректить на робочий
 * стіл. Надійніше за deny-list для вузько-обмежених кабінетів: нові розділи
 * системи за замовчуванням недоступні, доки їх свідомо не додадуть сюди.
 *
 * Кабінет «Склад» — набір збігається з `getWarehouseSections` у
 * `sidebar-links.ts`. Крім явних пунктів меню, дозволено службові піддороги:
 * `warehouse-tasks` (deep-link з блоку «Завдання») і `products` (картки/створення
 * товару з блоку «Прайс»).
 */
const ALLOWED_PREFIXES: Partial<Record<ManagerRole, readonly string[]>> = {
  warehouse: [
    "/manager/routes",
    "/manager/tasks",
    "/manager/warehouse-tasks",
    "/manager/reminders",
    "/manager/receivings",
    "/manager/stock-documents/repackings",
    "/manager/stock-documents/inventories",
    "/manager/bag-state-changes",
    "/manager/np-registers",
    "/manager/reports/stock-balance",
    "/manager/prices",
    "/manager/products",
    "/manager/messenger",
    "/manager/trash",
    "/manager/settings",
  ],
};

/**
 * Винятки-дозволи, що мають ПЕРЕВАГУ над deny-списком. Напр. менеджеру
 * закрито хаб `/manager/reports`, але дозволено власний звіт
 * `/manager/reports/manager`.
 */
const ALLOWED_EXCEPTIONS: Partial<Record<ManagerRole, readonly string[]>> = {
  manager: ["/manager/reports/manager"],
};

function matchesPrefix(path: string, p: string): boolean {
  return path === p || path.startsWith(`${p}/`);
}

/** Чи заборонений цей шлях для ролі (точний збіг або піддорога `prefix/…`). */
function isDeniedForRole(role: ManagerRole, path: string): boolean {
  // Allow-list має найвищий пріоритет: обмежені ролі бачать лише свій набір.
  const allowOnly = ALLOWED_PREFIXES[role];
  if (allowOnly) {
    // Корінь /manager (робочий стіл) дозволено завжди.
    if (path === "/manager") return false;
    return !allowOnly.some((p) => matchesPrefix(path, p));
  }
  const allow = ALLOWED_EXCEPTIONS[role];
  if (allow && allow.some((p) => matchesPrefix(path, p))) return false;
  const prefixes = DENIED_PREFIXES[role];
  if (!prefixes) return false;
  return prefixes.some((p) => matchesPrefix(path, p));
}

export async function managerGuard(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.pathname;
  const cookie = req.cookies.get(MANAGER_ACCESS_COOKIE)?.value;
  let payload = null;
  try {
    payload = cookie ? verifyAccessToken(cookie) : null;
  } catch {
    payload = null;
  }

  if (isPublic(path)) {
    if (payload) {
      const url = req.nextUrl.clone();
      url.pathname = "/manager";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!payload) {
    const refreshed = await tryRefreshSession(req);
    if (refreshed) return refreshed;

    const url = req.nextUrl.clone();
    url.pathname = "/manager/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // RBAC: заборонені за роллю розділи — редірект на робочий стіл.
  if (isDeniedForRole(payload.role, path)) {
    const url = req.nextUrl.clone();
    url.pathname = "/manager";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
