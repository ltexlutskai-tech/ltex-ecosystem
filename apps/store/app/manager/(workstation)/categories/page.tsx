import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canManageCatalog } from "@/lib/manager/catalog-permissions";
import { CategoryForm } from "./_components/category-form";
import { DeleteCategoryButton } from "./_components/delete-category-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Категорії — L-TEX Manager" };

function Code1CBadge() {
  return (
    <span className="ml-2 rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">
      1С
    </span>
  );
}

export default async function ManagerCategoriesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");
  const canManage = canManageCatalog(user.role);

  const [categories, allCategories] = await Promise.all([
    prisma.category.findMany({
      where: { parentId: null },
      include: {
        children: {
          orderBy: { position: "asc" },
          include: { _count: { select: { products: true } } },
        },
        _count: { select: { products: true } },
      },
      orderBy: { position: "asc" },
    }),
    prisma.category.findMany({
      where: { parentId: null },
      orderBy: { position: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Категорії</h1>
        <p className="mt-1 text-sm text-gray-600">
          Керування деревом категорій. Категорії з 1С <Code1CBadge /> видаляти
          не можна.
        </p>
      </div>

      {canManage && (
        <div className="max-w-lg rounded-lg border bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">
            Додати категорію
          </h2>
          <CategoryForm parents={allCategories} />
        </div>
      )}

      <div className="space-y-3">
        {categories.map((cat) => (
          <div key={cat.id} className="rounded-lg border bg-white">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <span className="font-semibold text-gray-800">{cat.name}</span>
                {cat.code1C && <Code1CBadge />}
                <span className="ml-2 text-sm text-gray-400">/{cat.slug}</span>
                <span className="ml-2 text-sm text-gray-500">
                  ({cat._count.products} товарів)
                </span>
              </div>
              {canManage &&
                !cat.code1C &&
                cat._count.products === 0 &&
                cat.children.length === 0 && (
                  <DeleteCategoryButton
                    categoryId={cat.id}
                    categoryName={cat.name}
                  />
                )}
            </div>
            {cat.children.length > 0 && (
              <div className="px-4 py-1">
                {cat.children.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between border-b py-2 pl-4 last:border-b-0"
                  >
                    <div>
                      <span className="text-sm text-gray-700">{sub.name}</span>
                      {sub.code1C && <Code1CBadge />}
                      <span className="ml-2 text-xs text-gray-400">
                        /{sub.slug}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">
                        ({sub._count.products})
                      </span>
                    </div>
                    {canManage && !sub.code1C && sub._count.products === 0 && (
                      <DeleteCategoryButton
                        categoryId={sub.id}
                        categoryName={sub.name}
                      />
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
