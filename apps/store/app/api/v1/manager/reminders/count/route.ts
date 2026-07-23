import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * GET /api/v1/manager/reminders/count
 *
 * Лічильник НЕЗАКРИТИХ нагадувань «на мене» для бейджа сайдбару (пункт
 * «Нагадування»): власник = я, ще не виконано, час настав (remindAt ≤ now) і
 * не відкладено в майбутнє. Включає й подієві/товарні (на відміну від дзвіночка,
 * що фільтрує лише часові) — бо у списку вони теж «висять» незакритими.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ total: 0 }, { status: 200 });
  }

  const now = new Date();
  const total = await prisma.mgrReminder.count({
    where: {
      ownerUserId: user.id,
      completedAt: null,
      remindAt: { lte: now },
      OR: [{ snoozedUntilAt: null }, { snoozedUntilAt: { lte: now } }],
    },
  });

  return NextResponse.json({ total }, { status: 200 });
}
