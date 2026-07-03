import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { adminChatReplySchema } from "@/lib/validations";
import { requireAdmin } from "@/lib/admin-auth";
import { sendPushNotification } from "@/lib/push";

/**
 * POST /api/admin/chat/reply
 *
 * Admin-only endpoint for manager replies to a customer chat.
 * Authenticates via the manager JWT admin session (session 6.1). Sender is
 * forced to "manager" server-side; the client cannot choose it.
 *
 * Body: { customerId, text, imageUrl? }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = adminChatReplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Невірні дані" },
      { status: 400 },
    );
  }
  const { customerId, text, imageUrl } = parsed.data;

  // Confirm the customer exists before creating the message
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const message = await prisma.chatMessage.create({
    data: {
      customerId,
      sender: "manager", // always server-side; trusted admin session
      text: text.trim(),
      imageUrl: imageUrl ?? null,
    },
  });

  // Fire-and-forget push notification to customer
  void sendPushNotification(
    customerId,
    "Новий лист від менеджера",
    text.length > 100 ? `${text.slice(0, 97)}...` : text,
    { type: "chat", messageId: message.id },
  ).catch((err) => {
    console.error("[L-TEX] chat reply push failed", {
      customerId,
      messageId: message.id,
      error: err instanceof Error ? err.message : String(err),
    });
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
