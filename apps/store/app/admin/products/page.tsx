export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import { Badge, Button } from "@ltex/ui";
import { QUALITY_LABELS, type QualityLevel } from "@ltex/shared";
import Link from "next/link";
import { deleteProduct } from "./actions";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const page = parseInt(params.page ?? "1", 10);
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

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        category: true,
        _count: { select: { lots: true, images: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.product.count({ where }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="space-y-6">
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
              <th className="px-4 py-3 font-medium">Назва</th>
              <th className="px-4 py-3 font-medium">Артикул</th>
              <th className="px-4 py-3 font-medium">Категорія</th>
              <th className="px-4 py-3 font-medium">Якість</th>
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
                    <form action={deleteProduct.bind(null, product.id)}>
                      <button
                        type="submit"
                        className="text-red-500 hover:underline"
                      >
                        Вид.
                      </button>
                    </form>
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
              href={`/admin/products?${query ? `q=${query}&` : ""}page=${p}`}
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
