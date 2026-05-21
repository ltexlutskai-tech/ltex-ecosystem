import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  buildPricesOrderBy,
  buildPricesWhere,
  deriveProductRow,
  priceRowInclude,
  type PriceSort,
  type SortDir,
} from "@/lib/manager/prices";

/**
 * GET /api/v1/manager/prices
 *
 * Список товарів для менеджерського екрана «Прайс» (Етап 1). Дані спільні з
 * магазином (`Product` / `Lot` / `Price`). Підтримує пошук, фільтри, сортування
 * й пагінацію. Авторизація — будь-який залогінений менеджер/адмін.
 */

const boolParam = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true"));

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  categoryId: z.string().trim().min(1).max(64).optional(),
  arrivalFrom: z.string().trim().optional(),
  arrivalTo: z.string().trim().optional(),
  priceFrom: z.coerce.number().nonnegative().optional(),
  priceTo: z.coerce.number().nonnegative().optional(),
  inStock: boolParam,
  target: boolParam,
  onSale: boolParam,
  isNew: boolParam,
  hasVideo: boolParam,
  noVideo: boolParam,
  sort: z.enum(["name", "arrival"]).default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  // page/pageSize — clamp (not reject) щоб out-of-range URL-и не падали 400.
  page: z.coerce.number().int().catch(1),
  pageSize: z.coerce.number().int().catch(50),
});

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

function parseDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні параметри", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const p = parsed.data;

  const where = buildPricesWhere({
    q: p.q,
    categoryId: p.categoryId,
    arrivalFrom: parseDate(p.arrivalFrom),
    arrivalTo: parseDate(p.arrivalTo),
    priceFrom: p.priceFrom,
    priceTo: p.priceTo,
    inStock: p.inStock,
    target: p.target,
    onSale: p.onSale,
    isNew: p.isNew,
    hasVideo: p.hasVideo,
    noVideo: p.noVideo,
  });

  const orderBy = buildPricesOrderBy(p.sort as PriceSort, p.dir as SortDir);

  const page = clamp(p.page, 1, 9_999, 1);
  const pageSize = clamp(p.pageSize, 10, 100, 50);

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        articleCode: true,
        name: true,
        slug: true,
        description: true,
        priceUnit: true,
        videoUrl: true,
        inStock: true,
        createdAt: true,
        ...priceRowInclude,
      },
    }),
  ]);

  const now = new Date();
  const items = rows
    .map((r) => deriveProductRow(r, now))
    // onSale фільтр уточнюємо тут — у where лише наявність обох типів цін.
    .filter((row) => (p.onSale ? row.salePrice !== null : true));

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
