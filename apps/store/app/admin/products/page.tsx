export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import { Badge, Button } from "@ltex/ui";
import { QUALITY_LABELS, type QualityLevel } from "@ltex/shared";
import Link from "next/link";
import { DeleteProductButton } from "./delete-button";
import { AdminBreadcrumbs } from "@/components/admin/breadcrumbs";
import { SortHeader } from "@/components/admin/sort-header";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const page = parseInt(params.page ?? "1", 10);
  const sort = params.sort ?? "updatedAt";
  const dir = params.dir === "asc" ? "asc" : "desc";
  const perPage = 25;

  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { articleCode: { contains: query, mode: "insensitive" as const } },
          { code1C: { contains: query, mode: "insensitive" as const } },
          { slug: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : {};

  const orderByMap: Record<string, Record<string, string>> = {
    name: { name: dir },
    updatedAt: { updatedAt: dir },
    quality: { quality: dir },
  };
  const orderBy = orderByMap[sort] ?? { updatedAt: "desc" };

  const [products, total] = await Promise.all([
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
  ]);

  const totalPages = Math.ceil(total / perPage);
  const baseParams = new URLSearchParams();
  if (query) baseParams.set("q", query);

  function sortUrl(field: string) {
    const sp = new URLSearchParams(baseParams);
    sp.set("sort", field);
    sp.set("dir", sort === field && dir === "asc" ? "desc" : "asc");
    return `/admin/products?${sp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <AdminBreadcrumbs items={[{ label: "Товари" }]} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Товари ({total})</h1>
        <Button asChild>
          <Link href="/admin/products/new">Додати товар</Link>
        </Button>
      </div>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Пошук по назві, артикулу, коду 1С..."
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <Button type="submit" variant="secondary">
          Шукати
        </Button>
      </form>

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
            {products.map((product) => (
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
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/products?${query ? `q=${query}&` : ""}${sort !== "updatedAt" ? `sort=${sort}&dir=${dir}&` : ""}page=${p}`}
              className={`rounded-md border px-3 py-1 text-sm ${p === page ? "bg-green-50 text-green-700 border-green-200" : "hover:bg-gray-50"}`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
