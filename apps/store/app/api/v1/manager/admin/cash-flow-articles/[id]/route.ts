import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { updateCashFlowArticleSchema } from "@/lib/validations/mgr-dictionaries";

/**
 * PATCH — оновити статтю руху коштів (code/name/parentId/archived).
 * Лише admin. Гард: стаття не може бути власним батьком.
 */
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
  const parsed = updateCashFlowArticleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 3),
      },
      { status: 400 },
    );
  }

  if (parsed.data.parentId === id) {
    return NextResponse.json(
      { error: "Стаття не може бути власним батьком" },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.mgrCashFlowArticle.update({
      where: { id },
      data: parsed.data,
      select: {
        id: true,
        code: true,
        name: true,
        parentId: true,
        direction: true,
        archived: true,
      },
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
