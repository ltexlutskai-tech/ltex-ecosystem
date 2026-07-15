import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { assignSchema } from "@/lib/validations/manager-clients";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireRole(["admin", "owner"], req);
  if (!admin) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 3),
      },
      { status: 400 },
    );
  }

  const client = await prisma.mgrClient.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Клієнта не знайдено" }, { status: 404 });
  }

  const { userId } = parsed.data;

  if (userId === null) {
    await prisma.clientAssignment.deleteMany({ where: { customerId: id } });
    return NextResponse.json({ assignedManager: null });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, role: true, isActive: true },
  });
  if (!targetUser || !targetUser.isActive) {
    return NextResponse.json(
      { error: "Користувача не знайдено або неактивний" },
      { status: 404 },
    );
  }

  await prisma.$transaction([
    prisma.clientAssignment.deleteMany({ where: { customerId: id } }),
    prisma.clientAssignment.create({
      data: { userId, customerId: id },
    }),
  ]);

  return NextResponse.json({
    assignedManager: { id: targetUser.id, fullName: targetUser.fullName },
  });
}
