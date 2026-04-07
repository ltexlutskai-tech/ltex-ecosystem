import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { sendPushNotification } from "@/lib/push";
import { mobileChatMessageSchema } from "@/lib/validations";

/**
 * GET /api/mobile/chat?customerId=xxx&cursor=xxx&limit=50
 * Returns chat messages (newest first, paginated by cursor).
 *
 * POST /api/mobile/chat ��� send a message
 * Body: { customerId, text, imageUrl? }
 *
 * PUT /api/mobile/chat — mark messages as read
 * Body: { customerId, upToMessageId }
 */
export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get("customerId");
  if (!customerId) {
    return NextResponse.json({ error: "customerId required" }, { status: 400 });
  }

  const cursor = request.nextUrl.searchParams.get("cursor");
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "50"), 100);

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
    nextCursor: messages.length === limit ? messages[messages.length - 1]?.id : null,
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = mobileChatMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Невірні дані" }, { status: 400 });
  }
  const { customerId, text, sender } = parsed.data;
  const imageUrl = (body as Record<string, unknown>).imageUrl as string | undefined;
  const messageSender = sender;

  const message = await prisma.chatMessage.create({
    data: {
      customerId,
      sender: messageSender,
      text: text?.trim() ?? "",
      imageUrl: imageUrl ?? null,
    },
  });

  // When a manager sends a message, push-notify the customer
  if (messageSender === "manager") {
    sendPushNotification(
      customerId,
      "Нове повідомлення від менеджера",
      text?.trim() ?? "Нове повідомлення",
      { type: "chat", customerId },
    ).catch(() => {
      // Non-blocking — don't fail the response for push errors
    });
  }

  return NextResponse.json({
    id: message.id,
    sender: message.sender,
    text: message.text,
    imageUrl: message.imageUrl,
    createdAt: message.createdAt,
  }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { customerId, upToMessageId } = body as {
    customerId: string;
    upToMessageId: string;
  };

  if (!customerId) {
    return NextResponse.json({ error: "customerId required" }, { status: 400 });
  }

  // Mark all manager messages as read up to the given message
  const targetMessage = upToMessageId
    ? await prisma.chatMessage.findUnique({ where: { id: upToMessageId } })
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
