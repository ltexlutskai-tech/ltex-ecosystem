import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  timelinePostSchema,
  timelineQuerySchema,
} from "@/lib/validations/manager-clients";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const parsed = timelineQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Невірні параметри" },
      { status: 400 },
    );
  }
  const q = parsed.data;

  const client = await prisma.mgrClient.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Клієнта не знайдено" }, { status: 404 });
  }

  const where: Prisma.MgrClientTimelineEntryWhereInput = { clientId: id };
  if (q.search) {
    where.body = { contains: q.search, mode: "insensitive" };
  }
  if (q.kind) {
    where.kind = q.kind;
  }
  if (q.from || q.to) {
    const range: Prisma.DateTimeFilter = {};
    if (q.from) range.gte = new Date(q.from);
    if (q.to) {
      // Включно по кінцевий день (до 23:59:59.999).
      const end = new Date(q.to);
      end.setHours(23, 59, 59, 999);
      range.lte = end;
    }
    where.occurredAt = range;
  }

  const [total, entries] = await Promise.all([
    prisma.mgrClientTimelineEntry.count({ where }),
    prisma.mgrClientTimelineEntry.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        author: { select: { id: true, fullName: true } },
      },
    }),
  ]);

  return NextResponse.json({
    entries: entries.map((t) => ({
      id: t.id,
      kind: t.kind,
      body: t.body,
      occurredAt: t.occurredAt,
      author: t.author
        ? { id: t.author.id, fullName: t.author.fullName }
        : null,
      metadata: t.metadata,
    })),
    page: q.page,
    pageSize: q.pageSize,
    total,
  });
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
  const body = await req.json().catch(() => null);
  const parsed = timelinePostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 3),
      },
      { status: 400 },
    );
  }

  const client = await prisma.mgrClient.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Клієнта не знайдено" }, { status: 404 });
  }

  const attachments = parsed.data.attachments ?? [];
  const created = await prisma.mgrClientTimelineEntry.create({
    data: {
      clientId: id,
      kind: "comment",
      body: parsed.data.body ?? "",
      occurredAt: new Date(),
      authorUserId: user.id,
      metadata: attachments.length > 0 ? { attachments } : undefined,
    },
    include: { author: { select: { id: true, fullName: true } } },
  });

  return NextResponse.json(
    {
      entry: {
        id: created.id,
        kind: created.kind,
        body: created.body,
        occurredAt: created.occurredAt,
        author: created.author
          ? { id: created.author.id, fullName: created.author.fullName }
          : null,
        metadata: created.metadata,
      },
    },
    { status: 201 },
  );
}
