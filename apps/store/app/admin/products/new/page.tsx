export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import { ProductForm } from "../product-form";

export default async function NewProductPage() {
  const categories = await prisma.category.findMany({
    orderBy: { position: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Новий товар</h1>
      <ProductForm product={null} categories={categories} />
    </div>
  );
}
