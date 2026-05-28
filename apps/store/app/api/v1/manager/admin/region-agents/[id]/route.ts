import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { updateRegionAgentSchema } from "@/lib/validations/manager-region-agents";

/**
 * PATCH — змінити менеджера для запису мапи.
 * DELETE — видалити запис (область знов без менеджера).
 * Лише admin.
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireRole(["admin"], req);
  if (!admin) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateRegionAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 3),
      },
      { status: 400 },
    );
  }

  if (parsed.data.userId) {
    const user = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: "Менеджера не знайдено або деактивовано" },
        { status: 400 },
      );
    }
  }

  try {
    const updated = await prisma.mgrRegionAgent.update({
      where: { id },
      data: parsed.data,
      select: { id: true, region: true, userId: true },
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireRole(["admin"], req);
  if (!admin) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }

  const { id } = await params;
  try {
    await prisma.mgrRegionAgent.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
    }
    throw err;
  }
}
