import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getAdminStats, type Period } from "@/lib/admin-stats";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const VALID_PERIODS: Period[] = ["7d", "30d", "90d", "1y"];

export async function GET(request: NextRequest) {
  // Require an authenticated admin (manager JWT admin session — session 6.1)
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get("period");
  const fullStats = searchParams.get("full") === "1";

  // Simple stats (for auto-refresh notification bell)
  if (!fullStats) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      pendingOrders,
      unreadMessages,
      newSubscribersToday,
      emailQueueCount,
    ] = await Promise.all([
      prisma.order.count({ where: { status: "pending" } }),
      prisma.chatMessage.count({
        where: { sender: "customer", isRead: false },
      }),
      prisma.newsletterSubscriber.count({
        where: {
          subscribedAt: { gte: dayAgo },
          unsubscribedAt: null,
        },
      }),
      prisma.emailJob.count({
        where: { status: { in: ["pending", "retrying", "failed"] } },
      }),
    ]);

    return NextResponse.json({
      pendingOrders,
      unreadMessages,
      newSubscribersToday,
      emailQueueCount,
      timestamp: Date.now(),
    });
  }

  // Full stats with period filter
  const period: Period = VALID_PERIODS.includes(periodParam as Period)
    ? (periodParam as Period)
    : "30d";

  const stats = await getAdminStats(period);

  return NextResponse.json(stats);
}
