import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  buildLotsOrderBy,
  buildLotsWhere,
  groupLotsByProduct,
  lotRowSelect,
  serializeLotRow,
  type LotsListSort,
  type LotsListSortDir,
  type LotsListStatus,
} from "@/lib/manager/lots-list";

/**
 * GET /api/v1/manager/lots
 *
 * Глобальний список УСІХ лотів для менеджерського екрана «Деталі по мішках /
 * Наявні лоти» (Етап 3b — 1С форма ФормаДеталиХарактеристик). Дані спільні з
 * магазином (`Lot` / `Product` / `Barcode`). Базовий жорсткий фільтр — залишок
 * є (`weight > 0`). Підтримує пошук, фільтри (цільові / відео / на складі /
 * статус-бронь), сортування, пагінацію + групування за товаром.
 *
 * Картку конкретного лоту — `GET /api/v1/manager/lots/[id]` (Етап 3a).
 *
 * Авторизація — будь-який залогінений менеджер/адмін.
 */

const boolParam = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true"));

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  productId: z.string().trim().min(1).max(64).optional(),
  target: boolParam,
  hasVideo: boolParam,
  // onlyInStock — за замовчуванням true (базовий фільтр списку).
  onlyInStock: boolParam,
  status: z.enum(["all", "free", "reserved"]).default("all"),
  sort: z.enum(["product", "arrival", "weight"]).default("product"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  // page/pageSize — clamp (not reject) щоб out-of-range URL-и не падали 400.
  page: z.coerce.number().int().catch(1),
  pageSize: z.coerce.number().int().catch(50),
});

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
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

  const where = buildLotsWhere({
    q: p.q,
    productId: p.productId,
    target: p.target,
    hasVideo: p.hasVideo,
    // onlyInStock дефолтиться true у where-builder коли undefined.
    onlyInStock: p.onlyInStock,
    status: p.status as LotsListStatus,
  });

  const orderBy = buildLotsOrderBy(
    p.sort as LotsListSort,
    p.dir as LotsListSortDir,
  );

  const page = clamp(p.page, 1, 9_999, 1);
  const pageSize = clamp(p.pageSize, 10, 100, 50);

  const [total, rows] = await Promise.all([
    prisma.lot.count({ where }),
    prisma.lot.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: lotRowSelect,
    }),
  ]);

  const items = rows.map(serializeLotRow);
  const groups = groupLotsByProduct(items);

  return NextResponse.json({
    items,
    groups,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
