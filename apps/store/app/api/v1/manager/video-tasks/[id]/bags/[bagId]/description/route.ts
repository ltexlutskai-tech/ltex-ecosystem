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
 * POST /api/v1/manager/video-tasks/[id]/bags/[bagId]/description
 *
 * Формує YouTube-опис для КОНКРЕТНОГО мішка (свій ШК/вага/к-сть/відео) +
 * спільні характеристики завдання (сезон/сорт/стать/розміри, з довідників —
 * пишемо назви) + довідник посилань + посилання на лот + хештег. Зберігає у
 * мішку і повертає текст. Гейт: відеозона / admin / owner.
 */
const FILM_ROLES = ["videozone", "admin", "owner"];
const SITE_BASE = "https://new.ltex.com.ua";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; bagId: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!FILM_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }

  const { id, bagId } = await params;
  const bag = await prisma.mgrVideoTaskBag.findUnique({
    where: { id: bagId },
    include: { task: true },
  });
  if (!bag || bag.taskId !== id) {
    return NextResponse.json({ error: "Мішок не знайдено" }, { status: 404 });
  }
  if (!bag.barcode) {
    return NextResponse.json(
      { error: "У мішка немає штрихкоду" },
      { status: 409 },
    );
  }

  const product = await prisma.product.findUnique({
    where: { id: bag.task.productId },
    select: { code1C: true },
  });

  const [links, attrs] = await Promise.all([
    getVideoLinks(),
    loadProductAttributeOptions(),
  ]);
  const labelOf = (opts: AttrOption[], code: string | null): string | null =>
    code ? (opts.find((o) => o.value === code)?.label ?? code) : code;

  const lotUrl = `${SITE_BASE}/lot/${encodeURIComponent(bag.barcode)}`;
  const text = buildYoutubeDescription(
    {
      season: labelOf(attrs.seasons, bag.task.season),
      quality: labelOf(attrs.quality, bag.task.quality),
      unitsCount: bag.unitsCount,
      unitWeight: bag.unitWeight,
      lotWeightKg: bag.lotWeightKg,
      gender: labelOf(attrs.genders, bag.task.gender),
      sizes: bag.task.sizes,
      lotUrl,
      barcode: bag.barcode,
      productName: bag.task.productName,
      fallbackCode: bag.task.articleCode ?? product?.code1C ?? null,
    },
    links,
  );

  await prisma.mgrVideoTaskBag.update({
    where: { id: bagId },
    data: { youtubeDescription: text },
  });

  return NextResponse.json({ description: text });
}
