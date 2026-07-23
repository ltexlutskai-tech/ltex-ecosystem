import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { buildYoutubeDescription } from "@/lib/manager/video-description";
import { getVideoLinks } from "@/lib/manager/video-links";
import {
  loadProductAttributeOptions,
  type AttrOption,
} from "@/lib/manager/product-attributes";

/**
 * POST /api/v1/manager/video-tasks/[id]/description
 *
 * Формує YouTube-опис відеоогляду з характеристик завдання + довідника посилань
 * + посилання на лот на сайті + хештег-артикул + штрихкод, зберігає його у
 * завданні (`youtubeDescription`) і повертає текст. Кнопка «Готово» стає
 * активною лише після наявності опису. Гейт: відеозона / admin / owner.
 */

const FILM_ROLES = ["videozone", "admin", "owner"];
const SITE_BASE = "https://new.ltex.com.ua";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!FILM_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }

  const { id } = await params;
  const task = await prisma.mgrVideoTask.findUnique({ where: { id } });
  if (!task) {
    return NextResponse.json(
      { error: "Завдання не знайдено" },
      { status: 404 },
    );
  }
  if (!task.barcode) {
    return NextResponse.json(
      { error: "Спершу склад має принести мішок (штрихкод відсутній)" },
      { status: 409 },
    );
  }

  // Резервний код для хештега — code1C товару, якщо в назві немає (NNNN).
  const product = await prisma.product.findUnique({
    where: { id: task.productId },
    select: { code1C: true },
  });

  const [links, attrs] = await Promise.all([
    getVideoLinks(),
    loadProductAttributeOptions(),
  ]);
  const lotUrl = `${SITE_BASE}/lot/${encodeURIComponent(task.barcode)}`;

  // Характеристики зберігаються як коди довідників — у опис пишемо їх назви.
  const labelOf = (opts: AttrOption[], code: string | null): string | null => {
    if (!code) return code;
    return opts.find((o) => o.value === code)?.label ?? code;
  };

  const text = buildYoutubeDescription(
    {
      season: labelOf(attrs.seasons, task.season),
      quality: labelOf(attrs.quality, task.quality),
      unitsCount: task.unitsCount,
      unitWeight: task.unitWeight,
      lotWeightKg: task.lotWeightKg,
      gender: labelOf(attrs.genders, task.gender),
      sizes: task.sizes,
      lotUrl,
      barcode: task.barcode,
      productName: task.productName,
      fallbackCode: task.articleCode ?? product?.code1C ?? null,
    },
    links,
  );

  await prisma.mgrVideoTask.update({
    where: { id },
    data: { youtubeDescription: text },
  });

  return NextResponse.json({ description: text });
}
