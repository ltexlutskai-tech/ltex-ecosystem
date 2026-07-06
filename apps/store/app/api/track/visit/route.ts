import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@ltex/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Легкий лічильник візитів сайту (7.2 Блок 4). Без кукі й персональних даних:
 * зберігаємо лише агрегати по днях + хеш відвідувача (sha256 ip+ua+день+сіль)
 * для підрахунку унікальних. Викликається бекон-компонентом на кожен перехід.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    // М'який ліміт від накрутки/ботів.
    if (!rateLimit(`visit:${ip}`, { windowMs: 10_000, max: 20 }).allowed) {
      return new NextResponse(null, { status: 204 });
    }

    const ua = request.headers.get("user-agent") ?? "";
    const now = new Date();
    const dayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    const day = new Date(`${dayStr}T00:00:00.000Z`);
    const salt = process.env.MANAGER_JWT_SECRET ?? "ltex-visit-salt";
    const visitorHash = createHash("sha256")
      .update(`${ip}|${ua}|${dayStr}|${salt}`)
      .digest("hex");

    await prisma.siteVisitDay.upsert({
      where: { day },
      create: { day, pageviews: 1 },
      update: { pageviews: { increment: 1 } },
    });
    await prisma.siteVisitor
      .upsert({
        where: { day_visitorHash: { day, visitorHash } },
        create: { day, visitorHash },
        update: {},
      })
      .catch(() => {});
  } catch {
    // best-effort — трекінг не має ламати навігацію
  }
  return new NextResponse(null, { status: 204 });
}
