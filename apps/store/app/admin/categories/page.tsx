export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import { Button } from "@ltex/ui";
import { CategoryForm } from "./category-form";
import { deleteCategory } from "./actions";

export default async function CategoriesPage() {
  const categories = await prisma.category.findMany({
    where: { parentId: null },
    include: {
      children: {
        orderBy: { position: "asc" },
        include: { _count: { select: { products: true } } },
      },
      _count: { select: { products: true } },
    },
    orderBy: { position: "asc" },
  });

  const allCategories = await prisma.category.findMany({
    orderBy: { position: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Категорії</h1>

      <div className="max-w-lg rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Додати категорію</h2>
        <CategoryForm categories={allCategories} />
      </div>

      <div className="space-y-4">
        {categories.map((cat) => (
          <div key={cat.id} className="rounded-lg border bg-white">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <span className="font-semibold">{cat.name}</span>
                <span className="ml-2 text-sm text-gray-400">/{cat.slug}</span>
                <span className="ml-2 text-sm text-gray-500">
                  ({cat._count.products} товарів)
                </span>
              </div>
              {cat._count.products === 0 && cat.children.length === 0 && (
                <form action={deleteCategory.bind(null, cat.id)}>
                  <button
                    type="submit"
                    className="text-sm text-red-500 hover:underline"
                  >
                    Видалити
                  </button>
                </form>
              )}
            </div>
            {cat.children.length > 0 && (
              <div className="px-4 py-2">
                {cat.children.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between border-b py-2 pl-4 last:border-b-0"
                  >
                    <div>
                      <span className="text-sm">{sub.name}</span>
                      <span className="ml-2 text-xs text-gray-400">
                        /{sub.slug}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">
                        ({sub._count.products})
                      </span>
                    </div>
                    {sub._count.products === 0 && (
                      <form action={deleteCategory.bind(null, sub.id)}>
                        <button
                          type="submit"
                          className="text-xs text-red-500 hover:underline"
                        >
                          Видалити
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
