export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import { AdminBreadcrumbs } from "@/components/admin/breadcrumbs";
import { requireAdmin } from "@/lib/admin-auth";
import { AddFeaturedForm } from "./add-featured-form";
import { FeaturedRow } from "./featured-row";

const MAX_FEATURED = 12;

async function loadFeatured() {
  try {
    return await prisma.featuredProduct.findMany({
      orderBy: { position: "asc" },
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { position: "asc" } },
          },
        },
      },
    });
  } catch {
    return [];
  }
}

export default async function FeaturedAdminPage() {
  await requireAdmin();
  const featured = await loadFeatured();

  return (
    <div className="space-y-6">
      <AdminBreadcrumbs items={[{ label: "Топ товарів" }]} />

      <div>
        <h1 className="text-2xl font-bold">Топ товарів</h1>
        <p className="mt-1 text-sm text-gray-500">
          Оберіть до {MAX_FEATURED} товарів для головної сторінки. Порядок
          визначає порядок показу.
        </p>
        <p className="mt-1 text-sm text-gray-700">
          Обрано{" "}
          <span className="font-semibold">
            {featured.length} / {MAX_FEATURED}
          </span>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">Обрані товари</h2>
          {featured.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Ще нічого не обрано
            </p>
          ) : (
            <ul className="divide-y">
              {featured.map((entry, i) => (
                <FeaturedRow
                  key={entry.id}
                  entry={{
                    id: entry.id,
                    note: entry.note,
                    product: {
                      id: entry.product.id,
                      name: entry.product.name,
                      articleCode: entry.product.articleCode,
                      slug: entry.product.slug,
                      image: entry.product.images[0]?.url ?? null,
                    },
                  }}
                  isFirst={i === 0}
                  isLast={i === featured.length - 1}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">Додати товар</h2>
          {featured.length >= MAX_FEATURED ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Досягнуто ліміту {MAX_FEATURED} товарів. Видаліть один, щоб додати
              новий.
            </p>
          ) : (
            <AddFeaturedForm />
          )}
        </section>
      </div>
    </div>
  );
}
