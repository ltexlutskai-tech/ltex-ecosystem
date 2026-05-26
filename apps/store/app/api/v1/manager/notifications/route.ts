import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * Active overdue reminders для current manager:
 *   ownerUserId = me
 *   completedAt IS NULL
 *   periodicity != 'event'  ← подієві (тип «Для товарів» + ручні «По події»)
 *                              не нагадують за часом; з'являються лише у списку
 *   (snoozedUntilAt IS NULL OR snoozedUntilAt <= NOW())
 *   remindAt <= NOW()
 *
 * Повертає count + перші 10 для popover-list.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const now = new Date();
  const where = {
    ownerUserId: user.id,
    completedAt: null,
    periodicity: { not: "event" as const },
    remindAt: { lte: now },
    OR: [{ snoozedUntilAt: null }, { snoozedUntilAt: { lte: now } }],
  };

  const [overdueCount, items] = await Promise.all([
    prisma.mgrReminder.count({ where }),
    prisma.mgrReminder.findMany({
      where,
      orderBy: { remindAt: "asc" },
      take: 10,
      include: {
        client: { select: { id: true, name: true } },
      },
    }),
  ]);

  return NextResponse.json({
    overdueCount,
    items: items.map((r) => ({
      id: r.id,
      body: r.body,
      remindAt: r.remindAt.toISOString(),
      snoozedUntilAt: r.snoozedUntilAt?.toISOString() ?? null,
      actionType: r.actionType,
      source: r.source,
      // clientId став опційним (блок «Нагадування», Етап 1) — standalone
      // нагадування без клієнта теж можуть бути прострочені.
      client: r.client ? { id: r.client.id, name: r.client.name } : null,
    })),
  });
}
