import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("uncomplete") }),
  z.object({
    action: z.literal("snooze"),
    snoozedUntil: z
      .string()
      .datetime({ offset: true, message: "Невірна дата відкладання" }),
  }),
  z.object({
    action: z.literal("edit"),
    body: z.string().trim().min(1).max(500).optional(),
    remindAt: z.string().datetime({ offset: true }).optional(),
  }),
]);

interface ReminderRow {
  id: string;
  body: string;
  remindAt: Date;
  completedAt: Date | null;
  snoozedUntilAt: Date | null;
  createdAt: Date;
  owner: { id: string; fullName: string } | null;
}

function serialize(r: ReminderRow) {
  return {
    id: r.id,
    body: r.body,
    remindAt: r.remindAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    snoozedUntilAt: r.snoozedUntilAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    owner: r.owner ? { id: r.owner.id, fullName: r.owner.fullName } : null,
  };
}

async function loadOwned(id: string, rid: string) {
  const reminder = await prisma.mgrReminder.findUnique({
    where: { id: rid },
    include: { owner: { select: { id: true, fullName: true } } },
  });
  if (!reminder) return null;
  if (reminder.clientId !== id) return null;
  return reminder;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; rid: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const { id, rid } = await params;
  const reminder = await loadOwned(id, rid);
  if (!reminder) {
    return NextResponse.json(
      { error: "Нагадування не знайдено" },
      { status: 404 },
    );
  }
  if (reminder.ownerUserId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const data: {
    completedAt?: Date | null;
    snoozedUntilAt?: Date | null;
    body?: string;
    remindAt?: Date;
  } = {};

  switch (parsed.data.action) {
    case "complete":
      data.completedAt = new Date();
      break;
    case "uncomplete":
      data.completedAt = null;
      break;
    case "snooze":
      data.snoozedUntilAt = new Date(parsed.data.snoozedUntil);
      break;
    case "edit":
      if (parsed.data.body !== undefined) data.body = parsed.data.body.trim();
      if (parsed.data.remindAt !== undefined)
        data.remindAt = new Date(parsed.data.remindAt);
      break;
  }

  const updated = await prisma.mgrReminder.update({
    where: { id: rid },
    data,
    include: { owner: { select: { id: true, fullName: true } } },
  });

  return NextResponse.json({ reminder: serialize(updated) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; rid: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const { id, rid } = await params;
  const reminder = await loadOwned(id, rid);
  if (!reminder) {
    return NextResponse.json(
      { error: "Нагадування не знайдено" },
      { status: 404 },
    );
  }
  if (reminder.ownerUserId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }

  await prisma.mgrReminder.delete({ where: { id: rid } });
  return NextResponse.json({ ok: true });
}
