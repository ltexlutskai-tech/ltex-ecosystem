import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import type { LiveUser } from "./inventory-live";

const WRITE_ROLES = new Set(["manager", "admin", "owner", "warehouse"]);

/**
 * Гейт мутуючих операцій інвентаризації: авторизація + роль + документ у стані
 * `draft` (проведений не редагується). Повертає користувача або HTTP-помилку.
 */
export async function guardInventoryWrite(
  req: NextRequest,
  inventoryId: string,
): Promise<{ ok: true; user: LiveUser } | { ok: false; res: NextResponse }> {
  const user = await getCurrentUser(req);
  if (!user)
    return {
      ok: false,
      res: NextResponse.json({ error: "Не авторизовано" }, { status: 401 }),
    };
  if (!WRITE_ROLES.has(user.role))
    return {
      ok: false,
      res: NextResponse.json({ error: "Нема доступу" }, { status: 403 }),
    };
  const doc = await prisma.inventory.findUnique({
    where: { id: inventoryId },
    select: { status: true },
  });
  if (!doc)
    return {
      ok: false,
      res: NextResponse.json({ error: "Не знайдено" }, { status: 404 }),
    };
  if (doc.status !== "draft")
    return {
      ok: false,
      res: NextResponse.json(
        { error: "Документ проведено — редагування заборонено" },
        { status: 409 },
      ),
    };
  return { ok: true, user: { id: user.id, fullName: user.fullName } };
}
