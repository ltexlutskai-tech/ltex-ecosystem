import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * GET /api/v1/manager/leads/count
 *
 * Кількість АКТИВНИХ лідів з сайту — для індикатора на пункті «Клієнти» у
 * сайдбарі: менеджер бачить свої (agentUserId=я) + нічийні; admin/owner — усі.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ total: 0 });

  const isAdmin = ["admin", "owner"].includes(user.role);
  const total = await prisma.mgrLead.count({
    where: {
      status: "new",
      ...(isAdmin
        ? {}
        : { OR: [{ agentUserId: user.id }, { agentUserId: null }] }),
    },
  });
  return NextResponse.json({ total });
}
