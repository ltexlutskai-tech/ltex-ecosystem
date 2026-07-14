import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { createCashFlowArticleSchema } from "@/lib/validations/mgr-dictionaries";

/**
 * Блок «Оплати / Каса» — Етап 1. Адмін-CRUD довідника статей руху коштів
 * (← 1С Catalog.СтатьиДвиженияДенежныхСредств). Лише admin.
 *
 * GET — повний список (включно з архівними).
 * POST — створити статтю (code/name/parentId).
 */
export async function GET(req: NextRequest) {
  const admin = await requireRole(["admin", "owner"], req);
  if (!admin) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }

  const items = await prisma.mgrCashFlowArticle.findMany({
    orderBy: [{ archived: "asc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      parentId: true,
      direction: true,
      archived: true,
    },
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const admin = await requireRole(["admin", "owner"], req);
  if (!admin) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createCashFlowArticleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 3),
      },
      { status: 400 },
    );
  }

  const created = await prisma.mgrCashFlowArticle.create({
    data: {
      name: parsed.data.name,
      code: parsed.data.code ?? null,
      parentId: parsed.data.parentId ?? null,
      direction: parsed.data.direction,
    },
    select: {
      id: true,
      code: true,
      name: true,
      parentId: true,
      direction: true,
      archived: true,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
