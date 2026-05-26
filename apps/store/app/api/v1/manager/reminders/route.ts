import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getViewerOwnership } from "@/lib/manager/client-visibility";
import {
  REMINDER_INCLUDE,
  fetchProductNames,
  serializeReminder,
} from "@/lib/manager/reminder-serialize";
import { createReminderSchema } from "@/lib/validations/manager-reminder";

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const url = new URL(req.url);
  const showCompleted = url.searchParams.get("completed") === "true";
  const onlyOrderVideo = url.searchParams.get("orderVideo") === "true";
  const q = url.searchParams.get("q")?.trim() ?? "";
  const page = clampInt(url.searchParams.get("page"), 1, 1, 9_999);
  const pageSize = clampInt(url.searchParams.get("pageSize"), 20, 1, 100);

  const where: Prisma.MgrReminderWhereInput = {};
  // Ownership: manager бачить лише свої; admin — усі.
  if (user.role !== "admin") where.ownerUserId = user.id;
  // За замовчуванням лише активні (не виконані).
  if (!showCompleted) where.completedAt = null;
  if (onlyOrderVideo) where.orderVideo = true;
  if (q.length > 0) where.body = { contains: q, mode: "insensitive" };

  const [rows, total] = await Promise.all([
    prisma.mgrReminder.findMany({
      where,
      orderBy: { remindAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: REMINDER_INCLUDE,
    }),
    prisma.mgrReminder.count({ where }),
  ]);

  // Batch-lookup назв товарів для всіх рядків сторінки (productId — плоский
  // скаляр без relation).
  const productNames = await fetchProductNames(rows);

  return NextResponse.json({
    reminders: rows.map((r) => serializeReminder(r, productNames)),
    total,
    page,
    pageSize,
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createReminderSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  // ─── Тип «Для товарів» ────────────────────────────────────────────────────
  if (parsed.data.isProductReminder) {
    const { clientId, items, body } = parsed.data;

    const client = await prisma.mgrClient.findUnique({
      where: { id: clientId },
      select: { id: true, name: true },
    });
    if (!client) {
      return NextResponse.json(
        { error: "Клієнта не знайдено" },
        { status: 400 },
      );
    }
    const ownership = await getViewerOwnership(user, clientId);
    if (ownership === "foreign") {
      return NextResponse.json(
        { error: "Немає доступу до цього клієнта" },
        { status: 403 },
      );
    }

    // Антидубль (§12): зібрати товари, які вже у АКТИВНИХ товарних нагадуваннях
    // цього менеджера для цього клієнта, і відкинути дублі з incoming.
    const activeItems = await prisma.mgrReminderItem.findMany({
      where: {
        reminder: {
          clientId,
          ownerUserId: user.id,
          isProductReminder: true,
          completedAt: null,
        },
      },
      select: { productId: true },
    });
    const alreadyCovered = new Set(activeItems.map((i) => i.productId));

    // Дедуп incoming (останнє значення quantity для productId перемагає) +
    // прибрати вже покриті.
    const dedupedMap = new Map<string, number>();
    const skippedProductIds: string[] = [];
    for (const item of items) {
      if (alreadyCovered.has(item.productId)) {
        if (!skippedProductIds.includes(item.productId)) {
          skippedProductIds.push(item.productId);
        }
        continue;
      }
      dedupedMap.set(item.productId, item.quantity);
    }

    if (dedupedMap.size === 0) {
      return NextResponse.json(
        {
          error:
            "Усі обрані товари вже є в активних нагадуваннях для цього клієнта",
        },
        { status: 400 },
      );
    }

    const created = await prisma.mgrReminder.create({
      data: {
        clientId,
        ownerUserId: user.id,
        body: body?.trim() || `Товари для ${client.name}`,
        remindAt: new Date(),
        periodicity: "event",
        isProductReminder: true,
        source: "manual",
        items: {
          create: [...dedupedMap.entries()].map(([productId, quantity]) => ({
            productId,
            quantity,
          })),
        },
      },
      include: REMINDER_INCLUDE,
    });

    const productNames = await fetchProductNames([created]);
    return NextResponse.json(
      {
        reminder: serializeReminder(created, productNames),
        skippedProductIds,
      },
      { status: 201 },
    );
  }

  // ─── Тип «Звичайне» ───────────────────────────────────────────────────────
  const { body, remindAt, periodicity, orderVideo, clientId } = parsed.data;

  // Якщо вказано клієнта — він має існувати і бути у scope (manager — лише свій).
  if (clientId) {
    const client = await prisma.mgrClient.findUnique({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json(
        { error: "Клієнта не знайдено" },
        { status: 400 },
      );
    }
    const ownership = await getViewerOwnership(user, clientId);
    if (ownership === "foreign") {
      return NextResponse.json(
        { error: "Немає доступу до цього клієнта" },
        { status: 403 },
      );
    }
  }

  const created = await prisma.mgrReminder.create({
    data: {
      clientId: clientId ?? null,
      ownerUserId: user.id,
      body: body.trim(),
      remindAt: new Date(remindAt),
      periodicity,
      orderVideo,
      isProductReminder: false,
      source: "manual",
    },
    include: REMINDER_INCLUDE,
  });

  const productNames = await fetchProductNames([created]);
  return NextResponse.json(
    { reminder: serializeReminder(created, productNames) },
    { status: 201 },
  );
}
