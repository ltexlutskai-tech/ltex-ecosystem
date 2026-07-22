import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { sanitizeDashboardConfig } from "@/lib/manager/dashboard-widgets";

const VIEW_KEY = "dashboard";

/**
 * Розклад робочого столу користувача (кастомізовані віджети). Зберігається у
 * спільній таблиці `MgrUserViewPrefs` під viewKey `dashboard`. Валідація/клампінг
 * — через `sanitizeDashboardConfig` (єдиний allow-list типів віджетів).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const row = await prisma.mgrUserViewPrefs
    .findUnique({
      where: { userId_viewKey: { userId: user.id, viewKey: VIEW_KEY } },
    })
    .catch(() => null);

  const config = sanitizeDashboardConfig(row?.config ?? null, user.role);
  return NextResponse.json(config);
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  // Санітизація сама відкидає невідомі типи/поля + клампить ширину → безпечно.
  const config = sanitizeDashboardConfig(body, user.role);
  const configJson = config as unknown as Prisma.InputJsonValue;

  await prisma.mgrUserViewPrefs.upsert({
    where: { userId_viewKey: { userId: user.id, viewKey: VIEW_KEY } },
    create: { userId: user.id, viewKey: VIEW_KEY, config: configJson },
    update: { config: configJson },
  });

  return NextResponse.json(config);
}

export async function DELETE(req: NextRequest) {
  // «Скинути до типового» — видаляємо рядок → GET поверне дефолт за роллю.
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  await prisma.mgrUserViewPrefs
    .delete({
      where: { userId_viewKey: { userId: user.id, viewKey: VIEW_KEY } },
    })
    .catch(() => null);

  return NextResponse.json(sanitizeDashboardConfig(null, user.role));
}
