import type { Metadata } from "next";
import { prisma } from "@ltex/db";
import { Badge } from "@ltex/ui";
import {
  LOT_STATUSES,
  LOT_STATUS_LABELS,
  type LotStatus,
} from "@ltex/shared";
import Link from "next/link";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { Pagination } from "@/components/store/pagination";
import { AddToCartButton } from "@/components/store/add-to-cart-button";

export const metadata: Metadata = {
  title: "Лоти (мішки) — секонд хенд та сток гуртом",
  description:
    "Доступні лоти (мішки) L-TEX. Секонд хенд, сток, іграшки, Bric-a-Brac гуртом. Кожен лот зі штрихкодом, вагою та відеооглядом.",
};

export default async function LotsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const status = params.status;
  const query = params.q ?? "";
  const page = parseInt(params.page ?? "1", 10);
  const perPage = 30;

  const where: Record<string, unknown> = {};
  if (status) {
    where.status = status;
  } else {
    where.status = { in: ["free", "on_sale"] };
  }
  if (query) {
    where.OR = [
      { barcode: { contains: query, mode: "insensitive" } },
      { product: { name: { contains: query, mode: "insensitive" } } },
    ];
  }

  const [lots, total] = await Promise.all([
    prisma.lot.findMany({
      where,
      include: {
        product: {
          select: { name: true, slug: true, quality: true, category: { select: { name: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.lot.count({ where }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  const filterParams = new URLSearchParams();
  if (status) filterParams.set("status", status);
  if (query) filterParams.set("q", query);
  const baseHref = filterParams.toString()
    ? `/lots?${filterParams.toString()}`
    : "/lots";

  return (
    <div className="container mx-auto px-4 py-6">
      <Breadcrumbs items={[{ label: "Лоти" }]} />

      <h1 className="mt-4 text-3xl font-bold">Лоти (мішки)</h1>
      <p className="mt-1 text-gray-500">{total} лотів доступно</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/lots"
          className={`rounded-full border px-3 py-1 text-sm ${!status ? "border-green-500 bg-green-50 text-green-700" : "hover:border-green-500"}`}
        >
          Доступні
        </Link>
        {LOT_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/lots?status=${s}`}
            className={`rounded-full border px-3 py-1 text-sm ${status === s ? "border-green-500 bg-green-50 text-green-700" : "hover:border-green-500"}`}
          >
            {LOT_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      <form className="mt-4 flex gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          defaultValue={query}
          placeholder="Пошук по штрихкоду або назві..."
          className="flex-1 rounded-md border px-3 py-2 text-sm sm:max-w-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Шукати
        </button>
      </form>

      {lots.length === 0 ? (
        <p className="mt-12 text-center text-gray-500">Лотів не знайдено.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Штрихкод</th>
                <th className="px-4 py-3 font-medium">Товар</th>
                <th className="px-4 py-3 font-medium">Категорія</th>
                <th className="px-4 py-3 font-medium">Вага</th>
                <th className="px-4 py-3 font-medium">Ціна EUR</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => (
                <tr key={lot.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{lot.barcode}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/product/${lot.product.slug}`}
                      className="text-green-700 hover:underline"
                    >
                      <span className="line-clamp-1 max-w-xs">
                        {lot.product.name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {lot.product.category.name}
                  </td>
                  <td className="px-4 py-3">{lot.weight} кг</td>
                  <td className="px-4 py-3 font-medium">
                    €{lot.priceEur.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        lot.status === "free"
                          ? "default"
                          : lot.status === "on_sale"
                            ? "accent"
                            : "secondary"
                      }
                    >
                      {LOT_STATUS_LABELS[lot.status as LotStatus] ?? lot.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {lot.status === "free" && (
                      <AddToCartButton
                        lot={{
                          lotId: lot.id,
                          productId: lot.productId,
                          productName: lot.product.name,
                          barcode: lot.barcode,
                          weight: lot.weight,
                          priceEur: lot.priceEur,
                          quantity: lot.quantity,
                        }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  );
}
