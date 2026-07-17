import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { messageTemplateSchema } from "@/lib/manager/message-template";

/**
 * Manager «Прайс» — Stage 5b message templates endpoint.
 *
 * GET  — список шаблонів у зоні видимості менеджера: власні («Мої») + спільні
 *        («Спільні», isShared=true). Фільтри: `?scope=mine|shared` звужує вкладку,
 *        `?q=` шукає по назві АБО тексту (contains, регістронезалежно).
 * POST — створити шаблон (auth, Zod, createdByUserId = поточний менеджер,
 *        isShared = дозвіл автора показувати іншим).
 */

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope");
  const q = url.searchParams.get("q")?.trim();

  // Базова видимість: власні АБО спільні від інших.
  const mine = { createdByUserId: user.id };
  const shared = { isShared: true, NOT: { createdByUserId: user.id } };
  let visibility: Prisma.MgrMessageTemplateWhereInput;
  if (scope === "mine") visibility = mine;
  else if (scope === "shared") visibility = shared;
  else visibility = { OR: [mine, shared] };

  const search: Prisma.MgrMessageTemplateWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { text: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const templates = await prisma.mgrMessageTemplate.findMany({
    where: { AND: [visibility, search] },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      text: true,
      isShared: true,
      createdByUserId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      text: t.text,
      isShared: t.isShared,
      createdByUserId: t.createdByUserId,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

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

  const created = await prisma.mgrMessageTemplate.create({
    data: {
      name: parsed.data.name,
      text: parsed.data.text,
      isShared: parsed.data.isShared,
      createdByUserId: user.id,
    },
  });

  return NextResponse.json(
    {
      template: {
        id: created.id,
        name: created.name,
        text: created.text,
        isShared: created.isShared,
        createdByUserId: created.createdByUserId,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
