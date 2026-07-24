import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canManageTreasury } from "@/lib/manager/treasury-permission";
import { getCashBalances } from "@/lib/manager/cash-count";

const MAX_AMOUNT = 100_000_000;
const amountField = z.number().min(0).max(MAX_AMOUNT);

const saveSchema = z.object({
  actualUah: amountField,
  actualEur: amountField,
  actualUsd: amountField,
  comment: z.string().max(2000).optional(),
});

/**
 * POST /api/v1/manager/cash-count — зберегти підбиття каси: система сама
 * фіксує обліковий залишок на момент збереження (знімок), бухгалтер вносить
 * фактичний. Доступ — фінансовий контур (bookkeeper/admin/owner).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!canManageTreasury(user.role)) {
    return NextResponse.json({ error: "Недостатньо прав" }, { status: 403 });
  }

  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некоректні дані" }, { status: 400 });
  }

  const expected = await getCashBalances();
  const session = await prisma.cashCountSession.create({
    data: {
      countDate: new Date(),
      expectedUah: expected.UAH,
      expectedEur: expected.EUR,
      expectedUsd: expected.USD,
      actualUah: parsed.data.actualUah,
      actualEur: parsed.data.actualEur,
      actualUsd: parsed.data.actualUsd,
      comment: parsed.data.comment ?? null,
      createdByUserId: user.id,
      createdByName: user.fullName ?? null,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: session.id, expected });
}
