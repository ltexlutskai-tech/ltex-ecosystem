import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  isRecurring,
  nextOccurrence,
  type MgrReminderPeriod,
} from "@/lib/manager/reminder-recurrence";
import { patchReminderSchema } from "@/lib/validations/manager-reminder";

interface ReminderRow {
  id: string;
  body: string;
  remindAt: Date;
  completedAt: Date | null;
  snoozedUntilAt: Date | null;
  periodicity: string;
  isProductReminder: boolean;
  orderVideo: boolean;
  actionType: string;
  source: string;
  lotId: string | null;
  productId: string | null;
  clientId: string | null;
  createdAt: Date;
  client: { id: string; name: string } | null;
  owner: { id: string; fullName: string } | null;
}

function serialize(r: ReminderRow) {
  return {
    id: r.id,
    body: r.body,
    remindAt: r.remindAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    snoozedUntilAt: r.snoozedUntilAt?.toISOString() ?? null,
    periodicity: r.periodicity,
    isProductReminder: r.isProductReminder,
    orderVideo: r.orderVideo,
    actionType: r.actionType,
    source: r.source,
    lotId: r.lotId,
    productId: r.productId,
    clientId: r.clientId,
    createdAt: r.createdAt.toISOString(),
    client: r.client ? { id: r.client.id, name: r.client.name } : null,
    owner: r.owner ? { id: r.owner.id, fullName: r.owner.fullName } : null,
  };
}

const REMINDER_INCLUDE = {
  client: { select: { id: true, name: true } },
  owner: { select: { id: true, fullName: true } },
} as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;
  const reminder = await prisma.mgrReminder.findUnique({
    where: { id },
    select: {
      id: true,
      ownerUserId: true,
      remindAt: true,
      periodicity: true,
    },
  });
  if (!reminder) {
    return NextResponse.json(
      { error: "Нагадування не знайдено" },
      { status: 404 },
    );
  }
  if (reminder.ownerUserId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = patchReminderSchema.safeParse(json);
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
    periodicity?: MgrReminderPeriod;
    orderVideo?: boolean;
  } = {};

  switch (parsed.data.action) {
    case "complete": {
      // Повторюване нагадування не «гасне» — переноситься на наступний період
      // і лишається активним (completedAt = null). Одноразове — completedAt=now.
      const period = reminder.periodicity as MgrReminderPeriod;
      if (isRecurring(period)) {
        const next = nextOccurrence(reminder.remindAt, period);
        if (next) {
          data.remindAt = next;
          data.completedAt = null;
          data.snoozedUntilAt = null;
        } else {
          data.completedAt = new Date();
        }
      } else {
        data.completedAt = new Date();
      }
      break;
    }
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
      if (parsed.data.periodicity !== undefined)
        data.periodicity = parsed.data.periodicity;
      if (parsed.data.orderVideo !== undefined)
        data.orderVideo = parsed.data.orderVideo;
      break;
  }

  const updated = await prisma.mgrReminder.update({
    where: { id },
    data,
    include: REMINDER_INCLUDE,
  });

  return NextResponse.json({ reminder: serialize(updated) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;
  const reminder = await prisma.mgrReminder.findUnique({
    where: { id },
    select: { id: true, ownerUserId: true },
  });
  if (!reminder) {
    return NextResponse.json(
      { error: "Нагадування не знайдено" },
      { status: 404 },
    );
  }
  if (reminder.ownerUserId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }

  await prisma.mgrReminder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
