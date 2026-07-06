import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canManageCatalog } from "@/lib/manager/catalog-permissions";
import { ProductCreateForm } from "./_components/product-create-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Новий товар — L-TEX Manager" };

export default async function NewProductPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");
  if (!canManageCatalog(user.role)) redirect("/manager/prices");

  const categories = await prisma.category.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true, name: true, parentId: true },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="text-sm">
        <Link
          href="/manager/prices"
          className="text-gray-500 hover:text-gray-800 hover:underline"
        >
          ← Назад до прайсу
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-bold text-gray-800">Новий товар</h1>
        <p className="mt-1 text-sm text-gray-600">
          Створення товару в системі. Лоти додаються через Поступлення.
        </p>
      </div>
      <div className="rounded-lg border bg-white p-5">
        <ProductCreateForm categories={categories} />
      </div>
    </div>
  );
}
