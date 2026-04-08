import { NextResponse } from "next/server";
import { prisma } from "@ltex/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [pendingOrders, unreadMessages] = await Promise.all([
    prisma.order.count({ where: { status: "pending" } }),
    prisma.chatMessage.count({
      where: { sender: "customer", isRead: false },
    }),
  ]);

  return NextResponse.json({
    pendingOrders,
    unreadMessages,
    timestamp: Date.now(),
  });
}
