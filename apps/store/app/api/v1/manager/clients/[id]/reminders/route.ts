import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

const createSchema = z.object({
  body: z.string().trim().min(1, "Текст не може бути порожнім").max(500),
  remindAt: z.string().datetime({ offset: true, message: "Невірна дата" }),
});

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;
  const client = await prisma.mgrClient.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Клієнта не знайдено" }, { status: 404 });
  }

  const items = await prisma.mgrReminder.findMany({
    where: { clientId: id },
    orderBy: { remindAt: "asc" },
    include: { owner: { select: { id: true, fullName: true } } },
  });

  return NextResponse.json({ items: items.map(serialize) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;
  const client = await prisma.mgrClient.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Клієнта не знайдено" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const created = await prisma.mgrReminder.create({
    data: {
      clientId: id,
      ownerUserId: user.id,
      body: parsed.data.body.trim(),
      remindAt: new Date(parsed.data.remindAt),
    },
    include: { owner: { select: { id: true, fullName: true } } },
  });

  return NextResponse.json({ reminder: serialize(created) }, { status: 201 });
}
