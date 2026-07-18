import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { UA_REGION_SLUGS } from "@/lib/constants/regions";
import { normalizeMonth, TOTAL_PLAN_SLUG } from "@/lib/reports/manager-summary";

/**
 * План продажів по областях (ТЗ 2026-07-17). Читає будь-яка роль, що має
 * доступ до звіту (перевірка в самій сторінці); запис — лише admin/owner/
 * analyst (задають план).
 *
 * GET  ?month=YYYY-MM  → { plans: [...] }
 * POST { month, plans:[{regionSlug, planRevenueEur, planTtCount, planNewTtCount}] }
 *      → upsert усіх переданих рядків (по (month, regionSlug)).
 */

const WRITE_ROLES = ["admin", "owner", "analyst"] as const;
const ALLOWED_SLUGS = new Set<string>([...UA_REGION_SLUGS, TOTAL_PLAN_SLUG]);

export async function GET(req: NextRequest) {
  const user = await requireRole([...WRITE_ROLES], req);
  if (!user) {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }
  const month = normalizeMonth(req.nextUrl.searchParams.get("month"));
  if (!month) {
    return NextResponse.json({ error: "Невірний місяць" }, { status: 400 });
  }
  const plans = await prisma.salesPlan.findMany({ where: { month } });
  return NextResponse.json({ plans });
}

interface PlanInput {
  regionSlug?: unknown;
  planRevenueEur?: unknown;
  planTtCount?: unknown;
  planNewTtCount?: unknown;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function POST(req: NextRequest) {
  const user = await requireRole([...WRITE_ROLES], req);
  if (!user) {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }

  let body: { month?: unknown; plans?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Невірний запит" }, { status: 400 });
  }

  const month = normalizeMonth(
    typeof body.month === "string" ? body.month : "",
  );
  if (!month) {
    return NextResponse.json({ error: "Невірний місяць" }, { status: 400 });
  }
  if (!Array.isArray(body.plans)) {
    return NextResponse.json({ error: "Невірний запит" }, { status: 400 });
  }

  const rows = (body.plans as PlanInput[]).filter(
    (p) => typeof p.regionSlug === "string" && ALLOWED_SLUGS.has(p.regionSlug),
  );

  await prisma.$transaction(
    rows.map((p) => {
      const regionSlug = p.regionSlug as string;
      const data = {
        planRevenueEur: num(p.planRevenueEur),
        planTtCount: Math.round(num(p.planTtCount)),
        planNewTtCount: Math.round(num(p.planNewTtCount)),
      };
      return prisma.salesPlan.upsert({
        where: { month_regionSlug: { month, regionSlug } },
        create: { month, regionSlug, ...data },
        update: data,
      });
    }),
  );

  return NextResponse.json({ ok: true, saved: rows.length });
}
