import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canCreate } from "@/lib/permissions/role-permissions";
import { generateLotBarcode } from "@/lib/warehouse/barcode-generator";

const schema = z.object({
  productId: z.string().min(1),
});

/**
 * POST /api/v1/manager/warehouse/barcode/generate
 *
 * Згенерувати наступний доступний штрихкод для товару (паттерн
 * L-{articleCode}-{seq:05}). Викликається з форми поступлення коли
 * користувач натискає «Згенерувати» біля рядка.
 *
 * Доступ: усі ролі що можуть створювати поступлення (warehouse / admin /
 * owner). Згенерований штрихкод НЕ резервується у БД — це робиться лише
 * при проведенні документа. Тому теоретично два паралельні запити можуть
 * отримати один номер, але унікальний constraint на `lots.barcode` під
 * час проведення гарантує цілісність — duplicate caught у транзакції.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!canCreate({ role: user.role }, "receivings")) {
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  }
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невірний productId" }, { status: 400 });
  }
  try {
    const barcode = await generateLotBarcode(parsed.data.productId);
    return NextResponse.json({ barcode });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Помилка генерації" },
      { status: 500 },
    );
  }
}
