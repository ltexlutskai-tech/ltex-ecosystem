import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { countOpenAssignedTasks } from "@/lib/manager/tasks";

/**
 * GET /api/v1/manager/tasks/badge-count
 *
 * Сумарний лічильник для пункту «Завдання» у сайдбарі — по ВСІХ типах завдань,
 * доступних ролі (вкладки TaskTypeTabs):
 *  • доручення «на мене» (усі ролі);
 *  • склад/admin/owner — + відкриті відправлення (new+received) і мішки для
 *    відеозони (new/filming);
 *  • менеджер — лише доручення (відеозона для нього — записи без індикатора).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ total: 0 });

  let total = await countOpenAssignedTasks(user);

  if (["warehouse", "admin", "owner"].includes(user.role)) {
    const [warehouseOpen, videoOpen] = await Promise.all([
      prisma.warehouseTask.count({
        where: {
          status: { in: ["new", "received"] },
          sale: { markedForDeletion: false },
        },
      }),
      prisma.mgrVideoTask.count({
        where: {
          status:
            user.role === "warehouse" ? "new" : { in: ["new", "filming"] },
        },
      }),
    ]);
    total += warehouseOpen + videoOpen;
  }

  return NextResponse.json({ total });
}
