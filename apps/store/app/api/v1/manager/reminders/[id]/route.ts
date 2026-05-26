import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  isRecurring,
  nextOccurrence,
  type MgrReminderPeriod,
} from "@/lib/manager/reminder-recurrence";
import {
  REMINDER_INCLUDE,
  serializeOne,
} from "@/lib/manager/reminder-serialize";
import { patchReminderSchema } from "@/lib/validations/manager-reminder";

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
      isProductReminder: true,
      items: { select: { id: true, done: true } },
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

  // ─── Дії по рядку чек-листа товарів (з roll-up статусу нагадування) ─────────
  if (
    parsed.data.action === "completeItem" ||
    parsed.data.action === "uncompleteItem"
  ) {
    const { itemId } = parsed.data;
    const item = reminder.items.find((i) => i.id === itemId);
    if (!item) {
      return NextResponse.json({ error: "Рядок не знайдено" }, { status: 404 });
    }
    const targetDone = parsed.data.action === "completeItem";

    // Перерахунок: який стан буде у рядків після зміни цього рядка.
    const allDoneAfter = reminder.items.every((i) =>
      i.id === itemId ? targetDone : i.done,
    );

    await prisma.$transaction([
      prisma.mgrReminderItem.update({
        where: { id: itemId },
        data: { done: targetDone },
      }),
      prisma.mgrReminder.update({
        where: { id },
        data: { completedAt: allDoneAfter ? new Date() : null },
      }),
    ]);

    const updated = await prisma.mgrReminder.findUniqueOrThrow({
      where: { id },
      include: REMINDER_INCLUDE,
    });
    return NextResponse.json({ reminder: await serializeOne(updated) });
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
      // Товарне нагадування: «виконати все» → усі рядки done + completedAt=now.
      if (reminder.isProductReminder) {
        await prisma.$transaction([
          prisma.mgrReminderItem.updateMany({
            where: { reminderId: id },
            data: { done: true },
          }),
          prisma.mgrReminder.update({
            where: { id },
            data: { completedAt: new Date() },
          }),
        ]);
        const updated = await prisma.mgrReminder.findUniqueOrThrow({
          where: { id },
          include: REMINDER_INCLUDE,
        });
        return NextResponse.json({ reminder: await serializeOne(updated) });
      }
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
      // Товарне нагадування: «поновити» → усі рядки not done + completedAt=null.
      if (reminder.isProductReminder) {
        await prisma.$transaction([
          prisma.mgrReminderItem.updateMany({
            where: { reminderId: id },
            data: { done: false },
          }),
          prisma.mgrReminder.update({
            where: { id },
            data: { completedAt: null },
          }),
        ]);
        const updated = await prisma.mgrReminder.findUniqueOrThrow({
          where: { id },
          include: REMINDER_INCLUDE,
        });
        return NextResponse.json({ reminder: await serializeOne(updated) });
      }
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

  return NextResponse.json({ reminder: await serializeOne(updated) });
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
