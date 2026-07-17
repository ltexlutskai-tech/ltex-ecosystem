import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getCurrentRate } from "@/lib/exchange-rate";
import { buildProductShareText } from "@/lib/manager/share-message";
import {
  canEditProductCard,
  canManageCatalogStructure,
} from "@/lib/manager/catalog-permissions";
import { loadProductAttributeOptions } from "@/lib/manager/product-attributes";
import { DiscussButton } from "../../messenger/_components/discuss-button";
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

  // Характеристики редагують усі, крім торгових менеджерів (менеджери лише
  // переглядають). Середня вага / категорія / фото — лише власник/адмін.
  const canEditCard = canEditProductCard(user.role);
  const canManageStructure = canManageCatalogStructure(user.role);
  const [managerImages, categoryRows, attributeOptions, producerRows] =
    await Promise.all([
      canManageStructure
        ? prisma.productImage.findMany({
            where: { productId: product.id },
            orderBy: { position: "asc" },
            select: { id: true, url: true },
          })
        : Promise.resolve([] as { id: string; url: string }[]),
      canManageStructure
        ? prisma.category.findMany({
            orderBy: [{ position: "asc" }, { name: "asc" }],
            select: { id: true, name: true, parentId: true },
          })
        : Promise.resolve(
            [] as { id: string; name: string; parentId: string | null }[],
          ),
      loadProductAttributeOptions(),
      prisma.mgrProducer.findMany({
        where: { archived: false, markedForDeletion: false },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
        select: { label: true },
      }),
    ]);
  const producers = producerRows.map((p) => p.label);

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
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <Link
            href="/manager/prices"
            className="text-gray-500 hover:text-gray-800 hover:underline"
          >
            ← Назад до прайсу
          </Link>
          <Link
            href={`/manager/customers?assortmentSearch=${encodeURIComponent(
              product.articleCode ?? product.name,
            )}`}
            className="text-blue-600 hover:underline"
            title="Показати всіх клієнтів, що беруть цей товар"
          >
            👥 Клієнти цього товару
          </Link>
        </div>
        <DiscussButton
          docRef={{
            type: "product",
            label: product.name,
            subtitle: product.articleCode ?? undefined,
            url: `/manager/prices/${product.id}`,
          }}
        />
      </div>
      <ProductCardView
        product={product}
        productShareText={productShareText}
        rateUah={rateUah}
        sellerName={user.fullName}
        canEditCharacteristics={canEditCard}
        isOwnerAdmin={canManageStructure}
        attributeOptions={attributeOptions}
        producers={producers}
      />
      {canManageStructure && (
        <ProductAverageWeightEditor
          productId={product.id}
          currentValue={product.averageWeight ?? null}
        />
      )}
      {canManageStructure && (
        <ProductCategoryEditor
          productId={product.id}
          currentCategoryId={product.categoryId}
          categories={categoryTreeNodes}
        />
      )}
      {canManageStructure && (
        <ProductPhotoManager productId={product.id} images={managerImages} />
      )}
    </div>
  );
}
