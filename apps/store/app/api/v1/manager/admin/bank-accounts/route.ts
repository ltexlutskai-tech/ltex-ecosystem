import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { createBankAccountSchema } from "@/lib/validations/mgr-dictionaries";

/**
 * Блок «Оплати / Каса» — Етап 1. Адмін-CRUD довідника банк. рахунків
 * (← 1С Catalog.БанковскиеСчета). Лише admin.
 *
 * GET — повний список (включно з архівними, для керування).
 * POST — створити рахунок.
 */
export async function GET(req: NextRequest) {
  const admin = await requireRole(["admin"], req);
  if (!admin) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }

  const items = await prisma.mgrBankAccount.findMany({
    orderBy: [{ archived: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      hiddenInApp: true,
      archived: true,
    },
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const admin = await requireRole(["admin"], req);
  if (!admin) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createBankAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 3),
      },
      { status: 400 },
    );
  }

  const created = await prisma.mgrBankAccount.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      hiddenInApp: parsed.data.hiddenInApp,
    },
    select: {
      id: true,
      name: true,
      description: true,
      hiddenInApp: true,
      archived: true,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
