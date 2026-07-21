import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  getScanSheetList,
  insertDocumentsToScanSheet,
} from "@/lib/delivery/nova-poshta";

const WAREHOUSE_ROLES = ["warehouse", "admin", "owner"];

/**
 * Реєстри відправлень Нової Пошти (ScanSheet).
 *
 * GET  — список наявних реєстрів (передавальних відомостей для кур'єра).
 * POST — згрупувати обрані ТТН у реєстр (новий або наявний за `scanSheetRef`).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!WAREHOUSE_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Недостатньо прав" }, { status: 403 });
  }
  const registers = await getScanSheetList();
  return NextResponse.json({ registers });
}

const createSchema = z.object({
  documentRefs: z.array(z.string().min(1)).min(1).max(100),
  scanSheetRef: z.string().min(1).optional(),
});

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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Оберіть хоча б одну ТТН для реєстру" },
      { status: 400 },
    );
  }

  const result = await insertDocumentsToScanSheet(
    parsed.data.documentRefs,
    parsed.data.scanSheetRef,
  );
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    ref: result.ref,
    number: result.number,
  });
}
