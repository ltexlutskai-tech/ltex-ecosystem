/**
 * Блок «Завдання» (ТЗ 2026-07-18) — доручення між користувачами + складські
 * завдання від реалізацій, зведені в один вигляд картки (`TaskCard`).
 *
 * Чисті нормалізатори (без Prisma) → тестуються ізольовано. Async-запити — у
 * `lib/manager/tasks.ts`.
 */

export type TaskStatus = "open" | "done" | "archived";
export type TaskKind = "task" | "warehouse";

/** Тип завдання → підпис + колірна тема (підсвітка у списку). */
export const TASK_TYPE_META: Record<
  string,
  { label: string; color: "blue" | "amber" | "green" | "gray" }
> = {
  manual: { label: "Доручення", color: "blue" },
  warehouse: { label: "Склад", color: "amber" },
};

export function taskTypeMeta(type: string) {
  return TASK_TYPE_META[type] ?? { label: type, color: "gray" as const };
}

/** Людський підпис ролі-виконавця (для завдань на роль). */
const ROLE_LABEL: Record<string, string> = {
  warehouse: "Склад",
  manager: "Менеджери",
  admin: "Адміністратори",
  owner: "Власник",
};

export function roleLabelUk(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

/** Зведена картка завдання (спільна для ручних і складських). */
export interface TaskCard {
  id: string;
  kind: TaskKind;
  type: string; // manual | warehouse
  title: string;
  description: string | null;
  status: TaskStatus;
  createdByName: string;
  assigneeName: string;
  resultComment: string | null;
  completedAt: string | null;
  createdAt: string;
  /** Хто відправив у архів (для показу на архівній картці). */
  archivedByName: string | null;
  /** Deep-link (складські → детальна сторінка); null → дії inline. */
  href: string | null;
  /** Поточний користувач може закрити (він виконавець, завдання відкрите). */
  canComplete: boolean;
  /** Поточний користувач може перевідкрити (він постановник, завдання закрите). */
  canReopen: boolean;
  /** Поточний користувач може вилучити (постановник або admin/owner). */
  canDelete: boolean;
  /** Поточний користувач може відправити в архів (виконавець/постановник/admin/owner). */
  canArchive: boolean;
  /** Поточний користувач може відновити з архіву. */
  canUnarchive: boolean;
  clientId: string | null;
  saleId: string | null;
}

export interface Viewer {
  id: string;
  role: string;
}

// ─── Ручне завдання ──────────────────────────────────────────────────────────

export interface RawTask {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  resultComment: string | null;
  completedAt: Date | null;
  createdAt: Date;
  createdByUserId: string;
  createdByName: string;
  assigneeUserId: string | null;
  assigneeRole: string | null;
  assigneeName: string | null;
  archivedByName: string | null;
  clientId: string | null;
  saleId: string | null;
}

/** Ролі з повним доступом (можуть вилучати/архівувати будь-яке завдання). */
function isAdminOwner(role: string): boolean {
  return role === "admin" || role === "owner";
}

/** Чи цей користувач — виконавець завдання (особисто або за роллю). */
export function isAssignee(
  raw: Pick<RawTask, "assigneeUserId" | "assigneeRole">,
  viewer: Viewer,
): boolean {
  if (raw.assigneeUserId && raw.assigneeUserId === viewer.id) return true;
  if (raw.assigneeRole && raw.assigneeRole === viewer.role) return true;
  return false;
}

export function normalizeTask(raw: RawTask, viewer: Viewer): TaskCard {
  const status: TaskStatus =
    raw.status === "archived"
      ? "archived"
      : raw.status === "done"
        ? "done"
        : "open";
  const assigneeName =
    raw.assigneeName ??
    (raw.assigneeRole ? roleLabelUk(raw.assigneeRole) : "—");
  const mine = isAssignee(raw, viewer);
  const iCreated = raw.createdByUserId === viewer.id;
  const admin = isAdminOwner(viewer.role);
  const isArchived = status === "archived";
  // Виконавець, постановник або admin/owner — можуть архівувати/відновлювати.
  const canManage = mine || iCreated || admin;
  return {
    id: raw.id,
    kind: "task",
    type: raw.type,
    title: raw.title,
    description: raw.description,
    status,
    createdByName: raw.createdByName,
    assigneeName,
    resultComment: raw.resultComment,
    completedAt: raw.completedAt ? raw.completedAt.toISOString() : null,
    createdAt: raw.createdAt.toISOString(),
    archivedByName: raw.archivedByName,
    href: null,
    canComplete: mine && status === "open",
    canReopen: iCreated && status === "done",
    // Вилучити (hard-delete) — лише постановник або admin/owner.
    canDelete: iCreated || admin,
    canArchive: canManage && !isArchived,
    canUnarchive: canManage && isArchived,
    clientId: raw.clientId,
    saleId: raw.saleId,
  };
}

// ─── Складське завдання (від реалізації) ─────────────────────────────────────

export interface RawWarehouseTask {
  id: string;
  customerName: string;
  status: string; // new | received | sent | cancelled
  deliveryLabel: string | null;
  comment: string | null;
  managerName: string | null;
  createdAt: Date;
}

export function normalizeWarehouseTask(raw: RawWarehouseTask): TaskCard {
  const status: TaskStatus = raw.status === "sent" ? "done" : "open";
  const parts = [raw.deliveryLabel, raw.comment].filter(Boolean);
  return {
    id: raw.id,
    kind: "warehouse",
    type: "warehouse",
    title: `Підготувати відправлення: ${raw.customerName}`,
    description: parts.length > 0 ? parts.join(" · ") : null,
    status,
    createdByName: raw.managerName ?? "—",
    assigneeName: "Склад",
    resultComment: null,
    completedAt: null,
    createdAt: raw.createdAt.toISOString(),
    archivedByName: null,
    href: `/manager/warehouse-tasks/${raw.id}`,
    canComplete: false, // керується на детальній сторінці складу
    canReopen: false,
    canDelete: false,
    canArchive: false,
    canUnarchive: false,
    clientId: null,
    saleId: null,
  };
}
