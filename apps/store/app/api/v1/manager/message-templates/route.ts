import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { messageTemplateSchema } from "@/lib/manager/message-template";

/**
 * Manager «Прайс» — Stage 5b message templates endpoint.
 *
 * GET  — список усіх шаблонів (orderBy name asc). Спільний довідник — будь-який
 *        залогінений менеджер бачить усі.
 * POST — створити шаблон (auth, Zod, createdByUserId = поточний менеджер).
 */

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const templates = await prisma.mgrMessageTemplate.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      text: true,
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
      createdByUserId: user.id,
    },
  });

  return NextResponse.json(
    {
      template: {
        id: created.id,
        name: created.name,
        text: created.text,
        createdByUserId: created.createdByUserId,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
