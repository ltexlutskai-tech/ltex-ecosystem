import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { requireMobileSession } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/chat/unread — lightweight unread count for cheap polling.
 * Returns only `{ count }` so the bottom-tab badge can refresh every 30s
 * without paying for the full message list.
 *
 * Auth: Bearer <mobile token>. customerId is derived from the token.
 */
export async function GET(request: NextRequest) {
  const session = requireMobileSession(request);
  if (session instanceof NextResponse) return session;
  const { customerId } = session;

  const count = await prisma.chatMessage.count({
    where: { customerId, sender: "manager", isRead: false },
  });

  return NextResponse.json({ count });
}
