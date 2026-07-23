import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { VIDEO_LINK_DEFS } from "@/lib/manager/video-links";

/**
 * Довідник посилань YouTube-опису відеоогляду (Відеозона).
 *
 * GET — список рядків: ключ, назва, дефолт і поточне значення (з БД поверх
 *   дефолту). PUT — зберігає значення (upsert `MgrVideoLink`; порожній рядок =
 *   «повернутись до дефолту»). Гейт: admin / owner.
 */

const WRITE_ROLES = ["admin", "owner"];

const putSchema = z.object({
  links: z
    .array(
      z.object({
        key: z.string().min(1).max(64),
        url: z.string().trim().max(500),
      }),
    )
    .max(50),
});

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!WRITE_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }

  const rows = await prisma.mgrVideoLink.findMany({
    select: { key: true, url: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.url]));

  const links = VIDEO_LINK_DEFS.map((d) => ({
    key: d.key,
    label: d.label,
    defaultUrl: d.url,
    url: byKey.get(d.key)?.trim() || "",
  }));

  return NextResponse.json({ links });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!WRITE_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невірні дані" }, { status: 400 });
  }

  const known = new Map(VIDEO_LINK_DEFS.map((d) => [d.key, d]));
  const updates = parsed.data.links.filter((l) => known.has(l.key));

  await prisma.$transaction(
    updates.map((l) =>
      prisma.mgrVideoLink.upsert({
        where: { key: l.key },
        update: { url: l.url },
        create: {
          key: l.key,
          label: known.get(l.key)!.label,
          url: l.url,
          sortOrder: known.get(l.key)!.sortOrder,
        },
      }),
    ),
  );

  return NextResponse.json({ ok: true });
}
