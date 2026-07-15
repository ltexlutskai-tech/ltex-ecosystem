import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { recomputeDebtForClients } from "@/lib/manager/debt-register";
import { recordClientEventSafe } from "@/lib/manager/client-timeline";
import { debtCorrectionSchema } from "@/lib/validations/mgr-debt-correction";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * POST — ручна «Корекція боргу» (5.4.5c). На відміну від live-хуків 5.4.5b
 * (fire-and-forget при проведенні документів), це навмисна дія користувача:
 * рух + перерахунок кешу робляться СИНХРОННО (await), помилки вертаються.
 *
 * Кожна корекція — окремий рух `MgrDebtMovement` з kind="correction" та
 * унікальним `sourceId` (UUID), тому колізій за unique
 * `kind+sourceType+sourceId` немає.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  // Корекцію боргу дозволено лише власнику та адміністратору (рішення user).
  if (user.role !== "owner" && user.role !== "admin") {
    return NextResponse.json(
      { error: "Корекція боргу доступна лише власнику та адміністратору" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = debtCorrectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
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

  const { amountEur, direction, note } = parsed.data;
  const signed = round2(
    direction === "decrease" ? -Math.abs(amountEur) : Math.abs(amountEur),
  );

  await prisma.mgrDebtMovement.create({
    data: {
      clientId: id,
      amountEur: signed,
      kind: "correction",
      sourceType: "manual",
      sourceId: randomUUID(),
      occurredAt: new Date(),
      note: note ?? null,
      createdByUserId: user.id,
    },
  });

  await recomputeDebtForClients(prisma, [id]);

  const human =
    direction === "decrease"
      ? `Корекція боргу: ${signed.toFixed(2)} € (списання)`
      : `Корекція боргу: +${signed.toFixed(2)} € (збільшення)`;

  recordClientEventSafe({
    clientId: id,
    kind: "debt_correction",
    body: note ? `${human}. Примітка: ${note}` : human,
    authorUserId: user.id,
  });

  const updated = await prisma.mgrClient.findUnique({
    where: { id },
    select: { debt: true },
  });

  return NextResponse.json({ debt: updated?.debt ? Number(updated.debt) : 0 });
}
