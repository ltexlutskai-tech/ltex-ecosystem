import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  getRepackWeightTolerance,
  setRepackWeightTolerance,
} from "@/lib/manager/mgr-settings";

/**
 * GET/PUT /api/v1/manager/settings/repack-tolerance
 * Допуск різниці ваги при перепаковці (кг). Читання — усі ролі складу/адмін;
 * запис — лише склад/адмін/власник (ті, хто проводить перепаковку).
 */

const EDIT_ROLES = ["warehouse", "admin", "owner"];
const READ_ROLES = [
  "warehouse",
  "admin",
  "owner",
  "manager",
  "senior_manager",
  "supervisor",
  "analyst",
  "bookkeeper",
];

const schema = z.object({ toleranceKg: z.number().min(0).max(1000) });

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user)
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  if (!READ_ROLES.includes(user.role))
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  const toleranceKg = await getRepackWeightTolerance();
  return NextResponse.json({ toleranceKg });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user)
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  if (!EDIT_ROLES.includes(user.role))
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Невірне значення" }, { status: 400 });
  await setRepackWeightTolerance(parsed.data.toleranceKg);
  return NextResponse.json({ ok: true, toleranceKg: parsed.data.toleranceKg });
}
