export const dynamic = "force-dynamic";

import { BannerForm } from "../banner-form";
import { AdminBreadcrumbs } from "@/components/admin/breadcrumbs";

export default function NewBannerPage() {
  return (
    <div className="space-y-6">
      <AdminBreadcrumbs
        items={[
          { label: "Банери", href: "/admin/banners" },
          { label: "Новий" },
        ]}
      />
      <h1 className="text-2xl font-bold">Додати банер</h1>
      <BannerForm banner={null} />
    </div>
  );
}
