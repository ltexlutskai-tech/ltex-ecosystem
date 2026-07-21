import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { logAuditEvent } from "@/lib/audit/audit-log";
import {
  assertValueForField,
  BulkFieldError,
  getBulkEntity,
  getBulkField,
  type BulkValue,
} from "@/lib/manager/bulk-edit/registry";

/** Верхня межа розміру набору за один прохід (захист від блокування таблиці). */
const MAX_IDS = 2000;

/**
 * POST — «Групова обробка»: масово встановити значення дозволеного поля для
 * набору обʼєктів (аналог 1С «Групповая обработка справочников и документов»).
 *
 * Body: `{ entity, fieldKey, value, ids: string[] }`.
 *
 * Безпека: клієнт передає лише `fieldKey` — реальне Prisma-поле резолвиться з
 * серверного реєстру (allow-list). Права перевіряються per-field. Значення
 * валідується під тип поля. Усе — в одній транзакції; кожна операція → audit-лог.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    entity?: unknown;
    fieldKey?: unknown;
    value?: unknown;
    ids?: unknown;
  } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Невірні дані" }, { status: 400 });
  }

  const entity = typeof body.entity === "string" ? body.entity : "";
  const fieldKey = typeof body.fieldKey === "string" ? body.fieldKey : "";

  const entityDef = getBulkEntity(entity);
  if (!entityDef) {
    return NextResponse.json({ error: "Невідома сутність" }, { status: 400 });
  }
  const field = getBulkField(entity, fieldKey);
  if (!field) {
    return NextResponse.json({ error: "Невідоме поле" }, { status: 400 });
  }

  // Право змінювати саме це поле (per-field gate).
  if (!field.roles(user.role)) {
    return NextResponse.json(
      { error: "Немає доступу до зміни цього поля" },
      { status: 403 },
    );
  }

  // Значення під тип поля.
  let value: BulkValue;
  try {
    value = assertValueForField(field, body.value);
  } catch (err) {
    if (err instanceof BulkFieldError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  // Набір id.
  const rawIds = Array.isArray(body.ids) ? body.ids : [];
  const ids = Array.from(
    new Set(
      rawIds.filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Не обрано жодного обʼєкта" },
      { status: 400 },
    );
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json(
      { error: `Забагато обʼєктів за раз (макс. ${MAX_IDS})` },
      { status: 400 },
    );
  }

  // Для категорії — переконатись, що вона існує (FK-цілісність).
  if (field.type === "category" && typeof value === "string") {
    const cat = await prisma.category.findUnique({
      where: { id: value },
      select: { id: true },
    });
    if (!cat) {
      return NextResponse.json(
        { error: "Категорію не знайдено" },
        { status: 400 },
      );
    }
  }

  // Наразі MVP — лише `product`.
  if (entityDef.entity !== "product") {
    return NextResponse.json(
      { error: "Сутність не підтримується" },
      { status: 400 },
    );
  }

  let updated = 0;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const res = await tx.product.updateMany({
        where: { id: { in: ids } },
        data: { [field.column]: value },
      });
      return res.count;
    });
    updated = result;
  } catch (err) {
    console.error("[L-TEX] bulk-edit failed", {
      entity,
      fieldKey,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Не вдалося застосувати зміни" },
      { status: 500 },
    );
  }

  void logAuditEvent({
    user: { id: user.id, email: user.email, role: user.role },
    action: "update",
    resource: `bulk:${entity}.${fieldKey}`,
    summary: `Масова зміна «${field.label}»: ${updated} обʼєктів → ${describeValue(value)}`,
    dataAfter: { fieldKey, value, count: updated },
    req,
  });

  return NextResponse.json({ ok: true, updated });
}

function describeValue(value: BulkValue): string {
  if (value === null) return "(очищено)";
  if (typeof value === "boolean") return value ? "так" : "ні";
  return value;
}
