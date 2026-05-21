import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { messageTemplateSchema } from "@/lib/manager/message-template";

/**
 * Manager «Прайс» — Stage 5b message templates [id] endpoint.
 *
 * PATCH  — оновити шаблон (auth, Zod). Спільний довідник — будь-який менеджер
 *          може редагувати (як у 1С).
 * DELETE — видалити шаблон (auth).
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

  try {
    const updated = await prisma.mgrMessageTemplate.update({
      where: { id },
      data: {
        name: parsed.data.name,
        text: parsed.data.text,
      },
    });
    return NextResponse.json({
      template: {
        id: updated.id,
        name: updated.name,
        text: updated.text,
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
