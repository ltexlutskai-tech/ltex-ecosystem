import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canEditClient } from "@/lib/permissions/mgr-client-edit";
import { timelineCommentSchema } from "@/lib/validations/manager-clients";

/**
 * Картка клієнта — Фаза 4: редагування / видалення ЛИШЕ ручних записів історії
 * (`kind === "comment"`). Авто-записи (order/sale/payment/bron/reminder) —
 * read-only (400). Доступ: `canEditClient` (admin / власник клієнта) ТА автор
 * запису (або admin).
 */

async function loadEntry(entryId: string) {
  return prisma.mgrClientTimelineEntry.findUnique({
    where: { id: entryId },
    select: { id: true, clientId: true, kind: true, authorUserId: true },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id, entryId } = await params;

  const entry = await loadEntry(entryId);
  if (!entry || entry.clientId !== id) {
    return NextResponse.json({ error: "Запис не знайдено" }, { status: 404 });
  }
  if (entry.kind !== "comment") {
    return NextResponse.json(
      { error: "Авто-запис історії не можна редагувати" },
      { status: 400 },
    );
  }

  // Доступ до клієнта + автор запису (admin може все).
  if (!(await canEditClient(user, id))) {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }
  if (user.role !== "admin" && entry.authorUserId !== user.id) {
    return NextResponse.json(
      { error: "Можна редагувати лише власні коментарі" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = timelineCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 3),
      },
      { status: 400 },
    );
  }

  const updated = await prisma.mgrClientTimelineEntry.update({
    where: { id: entryId },
    data: { body: parsed.data.body },
    include: { author: { select: { id: true, fullName: true } } },
  });

  return NextResponse.json({
    entry: {
      id: updated.id,
      kind: updated.kind,
      body: updated.body,
      occurredAt: updated.occurredAt,
      author: updated.author
        ? { id: updated.author.id, fullName: updated.author.fullName }
        : null,
      metadata: updated.metadata,
    },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id, entryId } = await params;

  const entry = await loadEntry(entryId);
  if (!entry || entry.clientId !== id) {
    return NextResponse.json({ error: "Запис не знайдено" }, { status: 404 });
  }
  if (entry.kind !== "comment") {
    return NextResponse.json(
      { error: "Авто-запис історії не можна видалити" },
      { status: 400 },
    );
  }

  if (!(await canEditClient(user, id))) {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }
  if (user.role !== "admin" && entry.authorUserId !== user.id) {
    return NextResponse.json(
      { error: "Можна видаляти лише власні коментарі" },
      { status: 403 },
    );
  }

  await prisma.mgrClientTimelineEntry.delete({ where: { id: entryId } });

  return NextResponse.json({ ok: true });
}
