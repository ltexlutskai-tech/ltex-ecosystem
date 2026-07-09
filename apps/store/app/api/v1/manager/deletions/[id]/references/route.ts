import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@ltex/db";
import { requireAdmin } from "@/lib/auth/manager-auth";
import {
  findReferences,
  type DeletableEntityType,
} from "@/lib/manager/reference-check";

/**
 * GET — попередній перегляд звʼязків обʼєкта запиту (для адміна ДО рішення).
 * Показує, чи можна фізично стерти, чи лише архів + список блокерів.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(req);
  if (!admin)
    return NextResponse.json({ error: "Лише адміністратор" }, { status: 403 });

  const { id } = await params;
  const request = await prisma.deletionRequest.findUnique({ where: { id } });
  if (!request)
    return NextResponse.json({ error: "Запит не знайдено" }, { status: 404 });

  const refs = await findReferences(
    request.entityType as DeletableEntityType,
    request.entityId,
    request.dictType,
  );
  return NextResponse.json(refs);
}
