export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import { Badge, Button } from "@ltex/ui";
import Link from "next/link";
import { AdminBreadcrumbs } from "@/components/admin/breadcrumbs";
import { DeleteBannerButton } from "./delete-button";

async function loadBanners() {
  try {
    return await prisma.banner.findMany({ orderBy: { position: "asc" } });
  } catch {
    return [];
  }
}

export default async function BannersPage() {
  const banners = await loadBanners();

  return (
    <div className="space-y-6">
      <AdminBreadcrumbs items={[{ label: "Банери" }]} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Банери ({banners.length})</h1>
        <Button asChild>
          <Link href="/admin/banners/new">Додати банер</Link>
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Прев'ю</th>
              <th className="px-4 py-3 font-medium">Посилання</th>
              <th className="px-4 py-3 font-medium">Позиція</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium">Дії</th>
            </tr>
          </thead>
          <tbody>
            {banners.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  Банерів ще немає
                </td>
              </tr>
            ) : (
              banners.map((banner) => (
                <tr key={banner.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={banner.imageUrl}
                      alt={banner.title ?? ""}
                      className="h-[45px] w-20 rounded object-cover"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-md truncate font-mono text-xs text-gray-700">
                      {banner.ctaHref}
                    </div>
                  </td>
                  <td className="px-4 py-3">{banner.position}</td>
                  <td className="px-4 py-3">
                    {banner.isActive ? (
                      <Badge variant="default">Активний</Badge>
                    ) : (
                      <Badge variant="secondary">Неактивний</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link
                        href={`/admin/banners/${banner.id}/edit`}
                        className="text-green-600 hover:underline"
                      >
                        Ред.
                      </Link>
                      <DeleteBannerButton
                        bannerId={banner.id}
                        bannerLabel={banner.ctaHref}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
