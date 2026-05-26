import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getViewerOwnership } from "@/lib/manager/client-visibility";
import { createReminderSchema } from "@/lib/validations/manager-reminder";

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

  return NextResponse.json({
    reminders: rows.map(serialize),
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

  return NextResponse.json({ reminder: serialize(created) }, { status: 201 });
}
