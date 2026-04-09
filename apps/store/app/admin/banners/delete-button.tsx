"use client";

import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { deleteBanner } from "./actions";

export function DeleteBannerButton({
  bannerId,
  bannerTitle,
}: {
  bannerId: string;
  bannerTitle: string;
}) {
  return (
    <ConfirmDelete
      title="Видалити банер?"
      description={`Банер "${bannerTitle}" буде видалено. Файл зображення залишиться в Storage.`}
      action={() => deleteBanner(bannerId)}
    />
  );
}
