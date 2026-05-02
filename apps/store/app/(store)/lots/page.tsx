import type { Metadata } from "next";
import { prisma, Prisma } from "@ltex/db";
import Link from "next/link";
import { Search } from "lucide-react";
import {
  QUALITY_LABELS,
  SEASON_LABELS,
  COUNTRY_LABELS,
  type QualityLevel,
  type Country,
} from "@ltex/shared";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { Pagination } from "@/components/store/pagination";
import { LotCard } from "@/components/store/lot-card";
import { LotsFilters, LotsFilterSheet } from "@/components/store/lots-filters";
import type { LotCategoryOption } from "@/components/store/lots-filters-form";
import { LotsCategoryPills } from "@/components/store/lots-category-pills";
import { LotsSortSelect } from "@/components/store/lots-sort-select";
import { CatalogLayoutToggle } from "@/components/store/catalog-layout-toggle";
import { getCurrentRate } from "@/lib/exchange-rate";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Лоти (мішки) — секонд хенд, сток, іграшки гуртом",
  description:
    "Доступні лоти (мішки) L-TEX з відеооглядом. Секонд хенд, сток, іграшки, Bric-a-Brac гуртом. Кожен лот зі штрихкодом, вагою та реальним відео вмісту.",
};

const PER_PAGE = 30;

type SearchParams = Record<string, string | string[] | undefined>;

function getStr(params: SearchParams, key: string): string | undefined {
  const v = params[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parsePositiveFloat(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

interface ChipDescriptor {
  key: string;
  label: string;
  removeParams: { key: string; nextValue?: string }[];
}

const STATUS_LABELS: Record<string, string> = {
  free: "Вільні",
  on_sale: "Акції",
  reserved: "Заброньовані",
};

function buildChips(params: SearchParams): ChipDescriptor[] {
  const chips: ChipDescriptor[] = [];
  for (const s of parseList(getStr(params, "status"))) {
    chips.push({
      key: `status:${s}`,
      label: STATUS_LABELS[s] ?? s,
      removeParams: [
        {
          key: "status",
          nextValue: parseList(getStr(params, "status"))
            .filter((x) => x !== s)
            .join(","),
        },
      ],
    });
  }
  if (getStr(params, "isNew") === "true") {
    chips.push({
      key: "isNew",
      label: "Новинки (14 днів)",
      removeParams: [{ key: "isNew" }],
    });
  }
  for (const q of parseList(getStr(params, "quality"))) {
    chips.push({
      key: `quality:${q}`,
      label: QUALITY_LABELS[q as QualityLevel] ?? q,
      removeParams: [
        {
          key: "quality",
          nextValue: parseList(getStr(params, "quality"))
            .filter((x) => x !== q)
            .join(","),
        },
      ],
    });
  }
  for (const s of parseList(getStr(params, "season"))) {
    chips.push({
      key: `season:${s}`,
      label: SEASON_LABELS[s] ?? s,
      removeParams: [
        {
          key: "season",
          nextValue: parseList(getStr(params, "season"))
            .filter((x) => x !== s)
            .join(","),
        },
      ],
    });
  }
  for (const c of parseList(getStr(params, "country"))) {
    chips.push({
      key: `country:${c}`,
      label: COUNTRY_LABELS[c as Country] ?? c,
      removeParams: [
        {
          key: "country",
          nextValue: parseList(getStr(params, "country"))
            .filter((x) => x !== c)
            .join(","),
        },
      ],
    });
  }
  const wMin = getStr(params, "weightMin");
  const wMax = getStr(params, "weightMax");
  if (wMin || wMax) {
    chips.push({
      key: "weight",
      label: `Вага: ${wMin || "0"}–${wMax || "∞"} кг`,
      removeParams: [{ key: "weightMin" }, { key: "weightMax" }],
    });
  }
  const pMin = getStr(params, "priceMin");
  const pMax = getStr(params, "priceMax");
  if (pMin || pMax) {
    chips.push({
      key: "price",
      label: `Ціна: ${pMin || "0"}–${pMax || "∞"} ₴`,
      removeParams: [{ key: "priceMin" }, { key: "priceMax" }],
    });
  }
  const q = getStr(params, "q");
  if (q) {
    chips.push({
      key: "q",
      label: `Пошук: ${q}`,
      removeParams: [{ key: "q" }],
    });
  }
  return chips;
}

function chipHref(params: SearchParams, descriptor: ChipDescriptor): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v) next.set(k, v);
  }
  for (const update of descriptor.removeParams) {
    if (update.nextValue) {
      next.set(update.key, update.nextValue);
    } else {
      next.delete(update.key);
    }
  }
  next.delete("page");
  const qs = next.toString();
  return qs ? `/lots?${qs}` : "/lots";
}

function buildBaseHref(params: SearchParams): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v && k !== "page") next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `/lots?${qs}` : "/lots";
}

function computeSalePercent(
  prices: { priceType: string; amount: number }[],
): number | undefined {
  const wholesale = prices.find((p) => p.priceType === "wholesale")?.amount;
  const akciya = prices.find((p) => p.priceType === "akciya")?.amount;
  if (!wholesale || !akciya || wholesale <= 0 || akciya >= wholesale) {
    return undefined;
  }
  return Math.round(((wholesale - akciya) / wholesale) * 100);
}

export default async function LotsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const statuses = parseList(getStr(params, "status"));
  const isNewOnly = getStr(params, "isNew") === "true";
  const categoryIds = parseList(getStr(params, "categoryId"));
  const qualities = parseList(getStr(params, "quality"));
  const seasons = parseList(getStr(params, "season"));
  const countries = parseList(getStr(params, "country"));
  const weightMin = parsePositiveFloat(getStr(params, "weightMin"));
  const weightMax = parsePositiveFloat(getStr(params, "weightMax"));
  const priceMin = parsePositiveFloat(getStr(params, "priceMin"));
  const priceMax = parsePositiveFloat(getStr(params, "priceMax"));
  const query = (getStr(params, "q") ?? "").trim();
  const sort = getStr(params, "sort") ?? "newest";
  const layout: "grid" | "list" =
    getStr(params, "layout") === "list" ? "list" : "grid";
  const pageRaw = parseInt(getStr(params, "page") ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const where: Prisma.LotWhereInput = {};
  const validStatuses = statuses.filter((s) =>
    ["free", "on_sale", "reserved"].includes(s),
  );
  if (validStatuses.length > 0) {
    where.status = { in: validStatuses };
  } else {
    where.status = { in: ["free", "on_sale"] };
  }
  if (isNewOnly) {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    where.createdAt = { gte: cutoff };
  }
  if (typeof weightMin === "number" || typeof weightMax === "number") {
    where.weight = {
      ...(typeof weightMin === "number" ? { gte: weightMin } : {}),
      ...(typeof weightMax === "number" ? { lte: weightMax } : {}),
    };
  }
  if (typeof priceMin === "number" || typeof priceMax === "number") {
    // Filter inputs are UAH (matches what user sees on the card). Convert
    // to EUR before querying because lot.priceEur is stored in EUR.
    const rateForFilter = await getCurrentRate();
    const r = rateForFilter > 0 ? rateForFilter : 43;
    where.priceEur = {
      ...(typeof priceMin === "number" ? { gte: priceMin / r } : {}),
      ...(typeof priceMax === "number" ? { lte: priceMax / r } : {}),
    };
  }
  const productWhere: Prisma.ProductWhereInput = {};
  if (categoryIds.length > 0) productWhere.categoryId = { in: categoryIds };
  if (qualities.length > 0) productWhere.quality = { in: qualities };
  if (seasons.length > 0) productWhere.season = { in: seasons };
  if (countries.length > 0) productWhere.country = { in: countries };
  if (Object.keys(productWhere).length > 0) {
    where.product = productWhere;
  }
  if (query) {
    where.OR = [
      { barcode: { contains: query, mode: "insensitive" } },
      { product: { name: { contains: query, mode: "insensitive" } } },
    ];
  }

  let orderBy: Prisma.LotOrderByWithRelationInput;
  switch (sort) {
    case "priceAsc":
      orderBy = { priceEur: "asc" };
      break;
    case "priceDesc":
      orderBy = { priceEur: "desc" };
      break;
    case "weightDesc":
      orderBy = { weight: "desc" };
      break;
    case "newest":
    default:
      orderBy = { updatedAt: "desc" };
  }

  const [lots, total, categoryGroups, rate] = await Promise.all([
    prisma.lot.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            slug: true,
            name: true,
            priceUnit: true,
            categoryId: true,
            prices: { select: { priceType: true, amount: true } },
          },
        },
      },
      orderBy,
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.lot.count({ where }),
    prisma.lot.groupBy({
      by: ["productId"],
      where: { status: { in: ["free", "on_sale"] } },
      _count: { _all: true },
    }),
    getCurrentRate(),
  ]);

  // Build category options with counts (sum lot counts grouped by product →
  // join with product.categoryId).
  const productIds = categoryGroups.map((g) => g.productId);
  const products =
    productIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, categoryId: true },
        })
      : [];
  const productCategoryMap = new Map(products.map((p) => [p.id, p.categoryId]));
  const categoryCountMap = new Map<string, number>();
  for (const group of categoryGroups) {
    const catId = productCategoryMap.get(group.productId);
    if (!catId) continue;
    const cnt = group._count._all;
    categoryCountMap.set(catId, (categoryCountMap.get(catId) ?? 0) + cnt);
  }
  const categoryRows = await prisma.category.findMany({
    where: { id: { in: Array.from(categoryCountMap.keys()) } },
    select: { id: true, name: true, position: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  const categoryOptions: LotCategoryOption[] = categoryRows.map((c) => ({
    id: c.id,
    name: c.name,
    count: categoryCountMap.get(c.id) ?? 0,
  }));

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const baseHref = buildBaseHref(params);
  const chips = buildChips(params);

  return (
    <div className="container mx-auto px-4 py-6">
      <Breadcrumbs items={[{ label: "Лоти" }]} />

      <div className="mt-4 flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">Лоти (мішки)</h1>
        <span className="shrink-0 text-sm text-gray-500">
          Знайдено: <strong>{total}</strong>
        </span>
      </div>
      <p className="mt-1 text-gray-500">
        Кожен лот — окремий мішок з унікальним штрихкодом. Дивись відеоогляд,
        додай у замовлення.
      </p>

      <LotsCategoryPills categories={categoryOptions} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        <LotsFilters />

        <div className="min-w-0">
          <form
            method="get"
            action="/lots"
            className="mb-5 flex flex-col gap-3 md:flex-row"
          >
            {/* Preserve other params on form submit */}
            {Object.entries(params).map(([k, v]) =>
              k === "q" ||
              k === "page" ||
              typeof v !== "string" ||
              !v ? null : (
                <input key={k} type="hidden" name={k} value={v} />
              ),
            )}
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                aria-hidden
              />
              <input
                name="q"
                defaultValue={query}
                placeholder="Пошук по штрихкоду або назві товару..."
                className="w-full rounded-md border py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <LotsSortSelect />
            <CatalogLayoutToggle currentLayout={layout} />
            <button
              type="submit"
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 md:hidden"
            >
              Шукати
            </button>
            <LotsFilterSheet />
          </form>

          {chips.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <Link
                  key={chip.key}
                  href={chipHref(params, chip)}
                  className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-700 hover:bg-green-100"
                >
                  {chip.label}
                  <span className="text-green-700/70" aria-hidden>
                    ×
                  </span>
                  <span className="sr-only">— прибрати фільтр</span>
                </Link>
              ))}
            </div>
          )}

          {lots.length === 0 ? (
            <div className="rounded-lg border bg-white p-12 text-center text-gray-500">
              Лотів за вашими фільтрами не знайдено. Спробуйте змінити критерії
              або{" "}
              <Link
                href="/lots"
                className="text-green-700 underline hover:text-green-900"
              >
                скинути всі фільтри
              </Link>
              .
            </div>
          ) : (
            <div
              className={
                layout === "list"
                  ? "space-y-3"
                  : "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
              }
            >
              {lots.map((lot) => (
                <LotCard
                  key={lot.id}
                  layout={layout}
                  lot={{
                    id: lot.id,
                    barcode: lot.barcode,
                    weight: lot.weight,
                    quantity: lot.quantity,
                    priceEur: lot.priceEur,
                    videoUrl: lot.videoUrl,
                    status: lot.status,
                    createdAt: lot.createdAt.toISOString(),
                    product: {
                      id: lot.product.id,
                      slug: lot.product.slug,
                      name: lot.product.name,
                      priceUnit: lot.product.priceUnit,
                    },
                  }}
                  rate={rate}
                  salePercent={
                    lot.status === "on_sale"
                      ? computeSalePercent(lot.product.prices)
                      : undefined
                  }
                />
              ))}
            </div>
          )}

          <div className="mt-8">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              baseHref={baseHref}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
