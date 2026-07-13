import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

// Динамічно — журнал змінюється при кожній дії (жодного кешування відповіді).
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/manager/stock-documents/inventories/[id]/journal[?limit=]
 *
 * Журнал документа інвентаризації — для відстеження змін. Сегмент навмисно
 * `journal`, а не `logs`: назва `logs` матчиться правилом `.gitignore` і файл
 * не потрапляв у коміт/деплой (звідси був HTTP 404).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user)
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  const { id } = await params;
  const url = new URL(req.url);
  const limit = Math.min(
    500,
    Math.max(1, Number(url.searchParams.get("limit") ?? "200") || 200),
  );
  const logs = await prisma.inventoryLog.findMany({
    where: { inventoryId: id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      userName: true,
      action: true,
      message: true,
      barcode: true,
      createdAt: true,
    },
  });
  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      userName: l.userName,
      action: l.action,
      message: l.message,
      barcode: l.barcode,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}
