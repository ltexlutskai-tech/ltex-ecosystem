import { prisma } from "@ltex/db";
import type { NextRequest } from "next/server";
import type { ManagerRole } from "@/lib/auth/jwt";
import { isOwnerActionRole } from "@/lib/permissions/role-permissions";

/**
 * Audit Log — універсальний журнал дій (← Тиждень 1 блоку Ролі).
 *
 * Викликається з усіх мутаційних endpoints (POST/PATCH/DELETE) для аудиту.
 * Запис ніколи не редагується після створення (append-only).
 *
 * Особлива поведінка для owner: `isOwnerAction=true` ставиться автоматично,
 * щоб admin міг швидко відфільтрувати "що робив власник" у `/manager/admin/
 * audit?ownerOnly=true`. Жодних інших обмежень немає — owner має повний
 * доступ як admin.
 *
 * Помилки журналювання НЕ блокують основну операцію (fire-and-forget
 * pattern, як email-черга S70).
 */

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "login"
  | "logout"
  | "failed_login"
  | "password_reset"
  | "permission_change"
  | "export"
  | "post"; // проведення документа

export interface AuditUser {
  id: string;
  email: string;
  role: ManagerRole;
}

export interface AuditEventInput {
  user: AuditUser | null; // null коли не авторизовано (для failed_login)
  action: AuditAction;
  resource: string;
  resourceId?: string | null;
  summary?: string | null;
  /** Snapshot ДО зміни (для update/delete). */
  dataBefore?: Record<string, unknown> | null;
  /** Snapshot ПІСЛЯ зміни (для create/update). */
  dataAfter?: Record<string, unknown> | null;
  /** Request — щоб витягти IP+UA. Опційно. */
  req?: NextRequest | null;
}

/**
 * Записати подію у audit_logs. Fire-and-forget — помилка не пробрасується.
 * Викликати через `void logAuditEvent(...)` або `await` у тестах.
 */
export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const ip = input.req ? extractIp(input.req) : null;
    const userAgent = input.req
      ? (input.req.headers.get("user-agent") ?? null)
      : null;

    await prisma.auditLog.create({
      data: {
        userId: input.user?.id ?? null,
        userEmail: input.user?.email ?? null,
        userRole: input.user?.role ?? "anonymous",
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        summary: input.summary ?? null,
        // Prisma JSON: undefined → не записати (default NULL у БД) — поведінка
        // ідентична null для CREATE. Каст до `any` бо `Record<string,unknown>`
        // занадто широкий для InputJsonValue (масив|об'єкт|примітив), а ми
        // отримуємо довільний JSON-snapshot з callsite — це безпечно, Prisma
        // самостійно валідує JSON під час write.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dataBefore: (input.dataBefore ?? undefined) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dataAfter: (input.dataAfter ?? undefined) as any,
        ip,
        userAgent,
        isOwnerAction: input.user ? isOwnerActionRole(input.user.role) : false,
      },
    });
  } catch (err) {
    // Не блокуємо основну операцію. Логуємо у консоль для діагностики.
    console.warn("[L-TEX] audit log failed", {
      action: input.action,
      resource: input.resource,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Витягнути IP з NextRequest. Пріоритет: Cloudflare → X-Real-IP → XFF.
 * Збіг з логікою `lib/rate-limit.ts::getClientIp` (S64).
 */
function extractIp(req: NextRequest): string | null {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

/**
 * Helper для отримання audit-log записів для admin-UI.
 *
 * Підтримує фільтри: userId, role, action, resource, ownerOnly, період,
 * пагінація. Тільки read — запис йде лише через `logAuditEvent`.
 */
export interface AuditLogQueryParams {
  userId?: string;
  role?: ManagerRole;
  action?: AuditAction;
  resource?: string;
  resourceId?: string;
  ownerOnly?: boolean;
  fromDate?: Date;
  toDate?: Date;
  search?: string; // у summary
  page?: number;
  pageSize?: number;
}

export interface AuditLogQueryResult {
  items: Array<{
    id: string;
    userId: string | null;
    userEmail: string | null;
    userRole: string;
    action: string;
    resource: string;
    resourceId: string | null;
    summary: string | null;
    ip: string | null;
    isOwnerAction: boolean;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function queryAuditLog(
  params: AuditLogQueryParams,
): Promise<AuditLogQueryResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, params.pageSize ?? 50));

  const where: Record<string, unknown> = {};
  if (params.userId) where.userId = params.userId;
  if (params.role) where.userRole = params.role;
  if (params.action) where.action = params.action;
  if (params.resource) where.resource = params.resource;
  if (params.resourceId) where.resourceId = params.resourceId;
  if (params.ownerOnly) where.isOwnerAction = true;
  if (params.fromDate || params.toDate) {
    const range: Record<string, Date> = {};
    if (params.fromDate) range.gte = params.fromDate;
    if (params.toDate) range.lte = params.toDate;
    where.createdAt = range;
  }
  if (params.search?.trim()) {
    where.summary = { contains: params.search.trim(), mode: "insensitive" };
  }

  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        userId: true,
        userEmail: true,
        userRole: true,
        action: true,
        resource: true,
        resourceId: true,
        summary: true,
        ip: true,
        isOwnerAction: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
