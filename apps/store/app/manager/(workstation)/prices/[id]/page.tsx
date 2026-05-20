import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { loadProductCard } from "../_lib/load-product";
import { ProductCardView } from "../_components/product-card-view";

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
  const product = await loadProductCard(id, user.id);
  if (!product) notFound();

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
      <ProductCardView product={product} />
    </div>
  );
}
