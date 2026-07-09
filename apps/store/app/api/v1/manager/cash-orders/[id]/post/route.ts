import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/sale-ownership";
import { postCashOrder } from "@/lib/manager/cash-order";

/**
 * Проведення чернетки касового ордера (draft→posted): рухи ДДС + рух боргу +
 * архів. Ownership як у DELETE: admin — будь-який; manager — лише свої клієнти.
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

  const existing = await prisma.mgrCashOrder.findUnique({
    where: { id },
    select: {
      customerId: true,
      sale: { select: { customerId: true } },
      customer: { select: { code1C: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Оплату не знайдено" }, { status: 404 });
  }

  // Ownership: manager — лише свої клієнти (як у DELETE).
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null) {
    let code1C = existing.customer?.code1C ?? null;
    if (!code1C && existing.sale?.customerId) {
      const saleCustomer = await prisma.customer.findUnique({
        where: { id: existing.sale.customerId },
        select: { code1C: true },
      });
      code1C = saleCustomer?.code1C ?? null;
    }
    if (!code1C || !myCodes.includes(code1C)) {
      return NextResponse.json(
        { error: "Оплату не знайдено" },
        { status: 404 },
      );
    }
  }

  const result = await postCashOrder(id);
  if (!result.ok) {
    if (result.error === "not_found") {
      return NextResponse.json(
        { error: "Оплату не знайдено" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Оплата вже проведена" },
      { status: 409 },
    );
  }

  revalidatePath("/manager/payments");
  return NextResponse.json({ ok: true });
}
