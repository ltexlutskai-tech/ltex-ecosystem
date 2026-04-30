"use client";

import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { deleteBanner } from "./actions";

export function DeleteBannerButton({
  bannerId,
  bannerLabel,
}: {
  bannerId: string;
  bannerLabel: string;
}) {
  return (
    <ConfirmDelete
      title="Видалити банер?"
      description={`Банер "${bannerLabel}" буде видалено. Файл зображення залишиться в Storage.`}
      action={() => deleteBanner(bannerId)}
    />
  );
}
