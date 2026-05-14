import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  type ConfigItem,
  getAllKeysFor,
  getDefaultsFor,
  isViewKey,
  mergePrefs,
} from "@/lib/manager/view-defaults";
import { viewPrefsBodySchema } from "@/lib/validations/view-prefs";

interface RouteContext {
  params: Promise<{ viewKey: string }>;
}

function isItemsConfig(value: unknown): value is { items: ConfigItem[] } {
  if (!value || typeof value !== "object") return false;
  const items = (value as { items?: unknown }).items;
  return Array.isArray(items);
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { viewKey } = await ctx.params;
  if (!isViewKey(viewKey)) {
    return NextResponse.json({ error: "Невідомий viewKey" }, { status: 400 });
  }

  const row = await prisma.mgrUserViewPrefs.findUnique({
    where: { userId_viewKey: { userId: user.id, viewKey } },
  });

  const savedItems = isItemsConfig(row?.config)
    ? (row?.config as { items: ConfigItem[] }).items
    : null;
  const merged = mergePrefs(
    savedItems,
    getDefaultsFor(viewKey),
    getAllKeysFor(viewKey),
  );

  return NextResponse.json({ viewKey, items: merged });
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { viewKey } = await ctx.params;
  if (!isViewKey(viewKey)) {
    return NextResponse.json({ error: "Невідомий viewKey" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = viewPrefsBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const allKeysSet = new Set(getAllKeysFor(viewKey));
  const unknownKeys = parsed.data.items
    .map((i) => i.key)
    .filter((k) => !allKeysSet.has(k));
  if (unknownKeys.length > 0) {
    return NextResponse.json(
      {
        error: `Невідомі ключі: ${unknownKeys.slice(0, 5).join(", ")}`,
      },
      { status: 400 },
    );
  }

  // Дедуп через mergePrefs щоб гарантувати unique-keys + renumber.
  const normalized = mergePrefs(
    parsed.data.items,
    getDefaultsFor(viewKey),
    getAllKeysFor(viewKey),
  );

  const configJson = { items: normalized } as unknown as Prisma.InputJsonValue;

  await prisma.mgrUserViewPrefs.upsert({
    where: { userId_viewKey: { userId: user.id, viewKey } },
    create: { userId: user.id, viewKey, config: configJson },
    update: { config: configJson },
  });

  return NextResponse.json({ viewKey, items: normalized });
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  // "Скинути до дефолту" — видаляємо row → GET повертатиме defaults.
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { viewKey } = await ctx.params;
  if (!isViewKey(viewKey)) {
    return NextResponse.json({ error: "Невідомий viewKey" }, { status: 400 });
  }

  await prisma.mgrUserViewPrefs
    .delete({
      where: { userId_viewKey: { userId: user.id, viewKey } },
    })
    .catch(() => null); // no-op якщо рядка немає

  const merged = mergePrefs(
    null,
    getDefaultsFor(viewKey),
    getAllKeysFor(viewKey),
  );
  return NextResponse.json({ viewKey, items: merged });
}
