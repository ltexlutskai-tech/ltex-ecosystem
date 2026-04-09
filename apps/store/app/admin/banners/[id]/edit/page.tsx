export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import { notFound } from "next/navigation";
import { BannerForm } from "../../banner-form";
import { AdminBreadcrumbs } from "@/components/admin/breadcrumbs";

export default async function EditBannerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const banner = await prisma.banner.findUnique({ where: { id } });
  if (!banner) notFound();

  return (
    <div className="space-y-6">
      <AdminBreadcrumbs
        items={[
          { label: "Банери", href: "/admin/banners" },
          { label: "Редагувати" },
        ]}
      />
      <h1 className="text-2xl font-bold">Редагувати банер</h1>
      <BannerForm banner={banner} />
    </div>
  );
}
