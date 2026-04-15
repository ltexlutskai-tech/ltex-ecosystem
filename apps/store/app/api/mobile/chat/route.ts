import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { mobileChatMessageSchema } from "@/lib/validations";
import { requireMobileSession } from "@/lib/mobile-auth";

/**
 * GET  /api/mobile/chat?cursor=xxx&limit=50 — chat messages (newest first, cursor-paginated)
 * POST /api/mobile/chat — send a message (sender is forced to "customer" server-side)
 *                         body: { text, imageUrl? }
 * PUT  /api/mobile/chat — mark manager messages read
 *                         body: { upToMessageId? }
 *
 * Auth: Bearer <mobile token>. customerId is derived from the token, never the body.
 */
export async function GET(request: NextRequest) {
  const session = requireMobileSession(request);
  if (session instanceof NextResponse) return session;
  const { customerId } = session;

  const cursor = request.nextUrl.searchParams.get("cursor");
  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get("limit") ?? "50"),
    100,
  );

  const messages = await prisma.chatMessage.findMany({
    where: {
      customerId,
      ...(cursor && { id: { lt: cursor } }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const unreadCount = await prisma.chatMessage.count({
    where: { customerId, sender: "manager", isRead: false },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      text: m.text,
      imageUrl: m.imageUrl,
      isRead: m.isRead,
      createdAt: m.createdAt,
    })),
    unreadCount,
    nextCursor:
      messages.length === limit ? messages[messages.length - 1]?.id : null,
  });
}

export async function POST(request: NextRequest) {
  const session = requireMobileSession(request);
  if (session instanceof NextResponse) return session;
  const { customerId } = session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = mobileChatMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Невірні дані" },
      { status: 400 },
    );
  }
  const { text, imageUrl } = parsed.data;

  const message = await prisma.chatMessage.create({
    data: {
      customerId,
      sender: "customer", // always server-side; client cannot impersonate manager
      text: text.trim(),
      imageUrl: imageUrl ?? null,
    },
  });

  return NextResponse.json(
    {
      id: message.id,
      sender: message.sender,
      text: message.text,
      imageUrl: message.imageUrl,
      createdAt: message.createdAt,
    },
    { status: 201 },
  );
}

export async function PUT(request: NextRequest) {
  const session = requireMobileSession(request);
  if (session instanceof NextResponse) return session;
  const { customerId } = session;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const upToMessageId =
    typeof body.upToMessageId === "string" ? body.upToMessageId : undefined;

  // Mark all manager messages as read up to the given message
  const targetMessage = upToMessageId
    ? await prisma.chatMessage.findFirst({
        where: { id: upToMessageId, customerId },
      })
    : null;

  await prisma.chatMessage.updateMany({
    where: {
      customerId,
      sender: "manager",
      isRead: false,
      ...(targetMessage && { createdAt: { lte: targetMessage.createdAt } }),
    },
    data: { isRead: true },
  });

  return NextResponse.json({ success: true });
}
