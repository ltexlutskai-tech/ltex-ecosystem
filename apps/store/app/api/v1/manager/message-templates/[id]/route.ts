import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser, isAdminRole } from "@/lib/auth/manager-auth";
import {
  canManageTemplate,
  messageTemplateSchema,
} from "@/lib/manager/message-template";

/**
 * Manager «Прайс» — Stage 5b message templates [id] endpoint.
 *
 * PATCH  — оновити шаблон (auth, Zod). Редагувати може ЛИШЕ автор шаблону
 *          (або admin/owner) — дозвіл на шаблон дає той, хто його створив.
 * DELETE — видалити шаблон (auth, лише автор або admin/owner).
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = messageTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const existing = await prisma.mgrMessageTemplate.findUnique({
    where: { id },
    select: { createdByUserId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Шаблон не знайдено" }, { status: 404 });
  }
  if (
    !canManageTemplate(existing, {
      id: user.id,
      isAdmin: isAdminRole(user.role),
    })
  ) {
    return NextResponse.json(
      { error: "Редагувати може лише автор шаблону" },
      { status: 403 },
    );
  }

  try {
    const updated = await prisma.mgrMessageTemplate.update({
      where: { id },
      data: {
        name: parsed.data.name,
        text: parsed.data.text,
        isShared: parsed.data.isShared,
      },
    });
    return NextResponse.json({
      template: {
        id: updated.id,
        name: updated.name,
        text: updated.text,
        isShared: updated.isShared,
        createdByUserId: updated.createdByUserId,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Шаблон не знайдено" },
        { status: 404 },
      );
    }
    throw err;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.mgrMessageTemplate.findUnique({
    where: { id },
    select: { createdByUserId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Шаблон не знайдено" }, { status: 404 });
  }
  if (
    !canManageTemplate(existing, {
      id: user.id,
      isAdmin: isAdminRole(user.role),
    })
  ) {
    return NextResponse.json(
      { error: "Видалити може лише автор шаблону" },
      { status: 403 },
    );
  }

  try {
    await prisma.mgrMessageTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Шаблон не знайдено" },
        { status: 404 },
      );
    }
    throw err;
  }
}
