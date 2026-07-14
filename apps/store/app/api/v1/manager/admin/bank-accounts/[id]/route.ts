import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { updateBankAccountSchema } from "@/lib/validations/mgr-dictionaries";

/**
 * PATCH — оновити банк. рахунок (name/description/hiddenInApp/archived).
 * Лише admin.
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
  const parsed = updateBankAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 3),
      },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.mgrBankAccount.update({
      where: { id },
      data: parsed.data,
      select: {
        id: true,
        name: true,
        description: true,
        kind: true,
        hiddenInApp: true,
        archived: true,
        recipientName: true,
        edrpou: true,
        iban: true,
        bankName: true,
        paymentPurpose: true,
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
