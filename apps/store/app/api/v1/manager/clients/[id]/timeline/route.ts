import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  timelineCommentSchema,
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

  const [total, entries] = await Promise.all([
    prisma.mgrClientTimelineEntry.count({ where: { clientId: id } }),
    prisma.mgrClientTimelineEntry.findMany({
      where: { clientId: id },
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

  const client = await prisma.mgrClient.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Клієнта не знайдено" }, { status: 404 });
  }

  const created = await prisma.mgrClientTimelineEntry.create({
    data: {
      clientId: id,
      kind: "comment",
      body: parsed.data.body,
      occurredAt: new Date(),
      authorUserId: user.id,
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
