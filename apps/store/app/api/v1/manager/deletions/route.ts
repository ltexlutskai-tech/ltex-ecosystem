import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  getCurrentUser,
  isAdminRole,
  requireAdmin,
  type CurrentManager,
} from "@/lib/auth/manager-auth";
import { canEditClient } from "@/lib/permissions/mgr-client-edit";
import { canDeleteManagerDoc } from "@/lib/manager/doc-delete-permission";
import {
  markForDeletion,
  listDeletionRequests,
} from "@/lib/manager/deletion-queue";
import type { DeletableEntityType } from "@/lib/manager/reference-check";

const ENTITY_TYPES = [
  "client",
  "order",
  "sale",
  "cash_order",
  "route_sheet",
  "dictionary",
  "category",
  "product",
] as const;

const createSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().min(1),
  reason: z.string().trim().min(3, "Вкажіть причину (мінімум 3 символи)"),
  dictType: z.string().optional().nullable(),
});

const DOC_TYPES: ReadonlySet<string> = new Set([
  "order",
  "sale",
  "cash_order",
  "route_sheet",
]);

/**
 * POST — позначити обʼєкт на вилучення (доступно менеджеру з правом на цей
 * обʼєкт). GET — черга запитів (лише admin/owner).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user)
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Некоректні дані" },
      { status: 400 },
    );
  }
  const { entityType, entityId, reason, dictType } = parsed.data;

  // Контроль доступу до обʼєкта.
  const allowed = await hasMarkAccess(user, entityType, entityId);
  if (!allowed) {
    return NextResponse.json(
      { error: "Немає доступу до обʼєкта" },
      { status: 403 },
    );
  }

  const res = await markForDeletion({
    entityType,
    entityId,
    reason,
    dictType: dictType ?? null,
    user,
    req,
  });
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, requestId: res.requestId });
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin)
    return NextResponse.json({ error: "Лише адміністратор" }, { status: 403 });

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") ?? "pending";
  const status =
    statusParam === "resolved" || statusParam === "all"
      ? statusParam
      : "pending";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);

  const { items, total } = await listDeletionRequests(status, page);
  return NextResponse.json({ items, total, page });
}

async function hasMarkAccess(
  user: CurrentManager,
  entityType: DeletableEntityType,
  entityId: string,
): Promise<boolean> {
  if (isAdminRole(user.role)) return true;
  if (entityType === "client") return canEditClient(user, entityId);
  if (DOC_TYPES.has(entityType)) return canDeleteManagerDoc(user.role);
  // Довідники / категорії / товари — лише admin/owner.
  return false;
}
