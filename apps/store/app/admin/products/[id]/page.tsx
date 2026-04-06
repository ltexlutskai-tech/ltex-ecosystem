export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import { notFound } from "next/navigation";
import { ProductForm } from "../product-form";
import { ImageUpload } from "../image-upload";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [product, categories] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: { images: { orderBy: { position: "asc" } } },
    }),
    prisma.category.findMany({
      orderBy: { position: "asc" },
    }),
  ]);

  if (!product) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Редагувати: {product.name}</h1>
      <ProductForm product={product} categories={categories} />
      <ImageUpload productId={product.id} images={product.images} />
    </div>
  );
}
