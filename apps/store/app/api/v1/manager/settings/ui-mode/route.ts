import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { UI_MODE_COOKIE } from "@/lib/manager/ui-mode";

/**
 * PUT /api/v1/manager/settings/ui-mode
 * Перемикання оболонки робочого простору: "classic" (вкладки/iframe) ↔
 * "simple" (одне вікно). Це особисте налаштування вигляду — дозволене всім
 * авторизованим ролям. Зберігається в cookie (per-browser); root-layout
 * читає його серверно на кожен рендер.
 */

const schema = z.object({ mode: z.enum(["classic", "simple"]) });

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невірне значення" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, mode: parsed.data.mode });
  res.cookies.set(UI_MODE_COOKIE, parsed.data.mode, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 рік
  });
  return res;
}
