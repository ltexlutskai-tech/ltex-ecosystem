import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getAdminStats, type Period } from "@/lib/admin-stats";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const VALID_PERIODS: Period[] = ["7d", "30d", "90d", "1y"];

export async function GET(request: NextRequest) {
  // Require an authenticated admin (Supabase Auth session)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get("period");
  const fullStats = searchParams.get("full") === "1";

  // Simple stats (for auto-refresh notification bell)
  if (!fullStats) {
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

  // Full stats with period filter
  const period: Period = VALID_PERIODS.includes(periodParam as Period)
    ? (periodParam as Period)
    : "30d";

  const stats = await getAdminStats(period);

  return NextResponse.json(stats);
}
