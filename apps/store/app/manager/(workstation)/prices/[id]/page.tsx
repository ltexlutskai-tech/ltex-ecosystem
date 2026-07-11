import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getCurrentRate } from "@/lib/exchange-rate";
import { buildProductShareText } from "@/lib/manager/share-message";
import { canManageCatalog } from "@/lib/manager/catalog-permissions";
import { loadProductCard } from "../_lib/load-product";
import { loadCategoryNodes, resolveCategoryAccess } from "../_lib/load-prices";
import { ProductCardView } from "../_components/product-card-view";
import { ProductPhotoManager } from "./_components/product-photo-manager";
import { ProductCategoryEditor } from "./_components/product-category-editor";
import { ProductAverageWeightEditor } from "./_components/product-average-weight-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Картка товару — L-TEX Manager" };

export default async function ProductCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const { id } = await params;
  const [product, rateUah, categoryNodes] = await Promise.all([
    loadProductCard(id, user.id),
    getCurrentRate(),
    loadCategoryNodes(),
  ]);
  if (!product) notFound();

  // Каркас доступів за групами (5.7): якщо категорія товару прихована для ролі
  // переглядача — товар недоступний (серверний фільтр, admin/owner bypass).
  const { hiddenCategoryIds } = resolveCategoryAccess(categoryNodes, {
    role: user.role,
  });
  if (
    product.categoryId &&
    hiddenCategoryIds &&
    hiddenCategoryIds.includes(product.categoryId)
  ) {
    notFound();
  }

  // Керування фото + категорією (7.2) — лише ролям каталогу.
  const canManage = canManageCatalog(user.role);
  const [managerImages, categoryRows] = canManage
    ? await Promise.all([
        prisma.productImage.findMany({
          where: { productId: product.id },
          orderBy: { position: "asc" },
          select: { id: true, url: true },
        }),
        prisma.category.findMany({
          orderBy: [{ position: "asc" }, { name: "asc" }],
          select: { id: true, name: true, parentId: true },
        }),
      ])
    : [[], []];

  // Вузли для каскадного вибору категорії (рівень за рівнем).
  const categoryTreeNodes = categoryRows.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
  }));

  // Рекламний текст товара будуємо на сервері (курс EUR — server-side).
  const productShareText = buildProductShareText({
    name: product.name,
    articleCode: product.articleCode,
    description: product.description,
    basePriceEur: product.basePrice?.amount ?? null,
    salePriceEur: product.salePrice,
    isNew: product.isNew,
    videoUrl: product.videoUrl,
    rateUah,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="text-sm">
        <Link
          href="/manager/prices"
          className="text-gray-500 hover:text-gray-800 hover:underline"
        >
          ← Назад до прайсу
        </Link>
      </div>
      <ProductCardView
        product={product}
        productShareText={productShareText}
        rateUah={rateUah}
        sellerName={user.fullName}
        isAdmin={user.role === "admin"}
      />
      {canManage && (
        <ProductAverageWeightEditor
          productId={product.id}
          currentValue={product.averageWeight ?? null}
        />
      )}
      {canManage && (
        <ProductCategoryEditor
          productId={product.id}
          currentCategoryId={product.categoryId}
          categories={categoryTreeNodes}
        />
      )}
      {canManage && (
        <ProductPhotoManager productId={product.id} images={managerImages} />
      )}
    </div>
  );
}
