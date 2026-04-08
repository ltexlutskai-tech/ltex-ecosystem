export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import { Badge, Button } from "@ltex/ui";
import { QUALITY_LABELS, QUALITY_LEVELS, type QualityLevel } from "@ltex/shared";
import Link from "next/link";
import { DeleteProductButton } from "./delete-button";
import { AdminBreadcrumbs } from "@/components/admin/breadcrumbs";
import { SortHeader } from "@/components/admin/sort-header";
import { AdminPagination } from "@/components/admin/pagination";
import { FilterSelect } from "@/components/admin/filter-select";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    sort?: string;
    dir?: string;
    category?: string;
    quality?: string;
  }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const page = parseInt(params.page ?? "1", 10);
  const sort = params.sort ?? "updatedAt";
  const dir = params.dir === "asc" ? "asc" : "desc";
  const categoryFilter = params.category ?? "";
  const qualityFilter = params.quality ?? "";
  const perPage = 25;

  const where: Record<string, unknown> = {};
  const conditions: Record<string, unknown>[] = [];

  if (query) {
    conditions.push({
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { articleCode: { contains: query, mode: "insensitive" } },
        { code1C: { contains: query, mode: "insensitive" } },
        { slug: { contains: query, mode: "insensitive" } },
      ],
    });
  }
  if (categoryFilter) {
    conditions.push({ categoryId: categoryFilter });
  }
  if (qualityFilter) {
    conditions.push({ quality: qualityFilter });
  }
  if (conditions.length > 0) {
    where.AND = conditions;
  }

  const orderByMap: Record<string, Record<string, string>> = {
    name: { name: dir },
    updatedAt: { updatedAt: dir },
    quality: { quality: dir },
  };
  const orderBy = orderByMap[sort] ?? { updatedAt: "desc" };

  const [products, total, categories] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        category: true,
        _count: { select: { lots: true, images: true } },
      },
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.product.count({ where }),
    prisma.category.findMany({
      where: { parentId: null },
      include: { children: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  // Build URL helpers
  const baseParams = new URLSearchParams();
  if (query) baseParams.set("q", query);
  if (categoryFilter) baseParams.set("category", categoryFilter);
  if (qualityFilter) baseParams.set("quality", qualityFilter);
  if (sort !== "updatedAt") {
    baseParams.set("sort", sort);
    baseParams.set("dir", dir);
  }

  function sortUrl(field: string) {
    const sp = new URLSearchParams(baseParams);
    sp.set("sort", field);
    sp.set("dir", sort === field && dir === "asc" ? "desc" : "asc");
    sp.delete("page");
    return `/admin/products?${sp.toString()}`;
  }

  function pageHref(p: number) {
    const sp = new URLSearchParams(baseParams);
    if (p > 1) sp.set("page", String(p));
    else sp.delete("page");
    return `/admin/products?${sp.toString()}`;
  }

  // Flatten categories for filter dropdown
  const categoryOptions = categories.flatMap((c) => [
    { value: c.id, label: c.name },
    ...c.children.map((ch) => ({
      value: ch.id,
      label: `  ${ch.name}`,
    })),
  ]);

  const qualityOptions = QUALITY_LEVELS.map((q) => ({
    value: q,
    label: QUALITY_LABELS[q],
  }));

  const hasFilters = query || categoryFilter || qualityFilter;

  return (
    <div className="space-y-6">
      <AdminBreadcrumbs items={[{ label: "Товари" }]} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Товари ({total})</h1>
        <Button asChild>
          <Link href="/admin/products/new">Додати товар</Link>
        </Button>
      </div>

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Пошук по назві, артикулу, коду 1С..."
          className="min-w-[200px] flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <Button type="submit" variant="secondary">
          Шукати
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          paramName="category"
          options={categoryOptions}
          placeholder="Всі категорії"
        />
        <FilterSelect
          paramName="quality"
          options={qualityOptions}
          placeholder="Всі якості"
        />
        {hasFilters && (
          <Link
            href="/admin/products"
            className="rounded-md border px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            Скинути фільтри
          </Link>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <SortHeader
                label="Назва"
                field="name"
                currentSort={sort}
                currentDir={dir}
                href={sortUrl("name")}
              />
              <th className="px-4 py-3 font-medium">Артикул</th>
              <th className="px-4 py-3 font-medium">Категорія</th>
              <SortHeader
                label="Якість"
                field="quality"
                currentSort={sort}
                currentDir={dir}
                href={sortUrl("quality")}
              />
              <th className="px-4 py-3 font-medium">Лотів</th>
              <th className="px-4 py-3 font-medium">Фото</th>
              <th className="px-4 py-3 font-medium">Дії</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Товарів не знайдено
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="max-w-xs truncate font-medium">
                      {product.name}
                    </div>
                    <div className="text-xs text-gray-400">{product.slug}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {product.articleCode ?? "-"}
                  </td>
                  <td className="px-4 py-3">{product.category.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">
                      {QUALITY_LABELS[product.quality as QualityLevel] ??
                        product.quality}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{product._count.lots}</td>
                  <td className="px-4 py-3">{product._count.images}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="text-green-600 hover:underline"
                      >
                        Ред.
                      </Link>
                      <DeleteProductButton
                        productId={product.id}
                        productName={product.name}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AdminPagination
        page={page}
        totalPages={totalPages}
        total={total}
        baseHref="/admin/products"
        buildHref={pageHref}
      />
    </div>
  );
}
