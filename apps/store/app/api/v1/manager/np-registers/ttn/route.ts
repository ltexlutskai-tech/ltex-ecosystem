import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { deleteNpTtnForSale } from "@/lib/delivery/create-ttn-for-sale";

const WAREHOUSE_ROLES = ["warehouse", "admin", "owner"];

/**
 * Видалення ТТН Нової Пошти зі списку «Готові ТТН (не в реєстрі)».
 *
 * POST — видаляє ЧЕРНЕТКУ ТТН у кабінеті НП (або просто очищає лінк, якщо ТТН
 * уже не існує) і прибирає прив'язку `ttnRef/expressWaybill/ttnCreatedAt` у
 * реалізації. Якщо ТТН уже в дорозі — 409 (видаляти не можна).
 */
const bodySchema = z.object({ saleId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!WAREHOUSE_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Недостатньо прав" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Не вказано реалізацію" },
      { status: 400 },
    );
  }

  const sale = await prisma.sale.findUnique({
    where: { id: parsed.data.saleId },
    select: { ttnRef: true, expressWaybill: true },
  });
  if (!sale) {
    return NextResponse.json(
      { error: "Реалізацію не знайдено" },
      { status: 404 },
    );
  }
  if (!sale.ttnRef) {
    return NextResponse.json({ ok: true, state: "no-ttn" });
  }

  const res = await deleteNpTtnForSale(sale.ttnRef, sale.expressWaybill);

  if (res.state === "in-transit") {
    return NextResponse.json(
      {
        error:
          "ТТН уже в дорозі — видалити не можна. Скасуйте відправлення в кабінеті Нової Пошти.",
      },
      { status: 409 },
    );
  }
  if (res.state === "error") {
    return NextResponse.json(
      { error: res.error ?? "Не вдалося видалити ТТН у Новій Пошті" },
      { status: 502 },
    );
  }

  // "deleted" або "no-ttn" — прибираємо лінк ТТН у реалізації.
  await prisma.sale.update({
    where: { id: parsed.data.saleId },
    data: { ttnRef: null, expressWaybill: null, ttnCreatedAt: null },
  });

  return NextResponse.json({ ok: true, state: res.state });
}
