"use client";

import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { deleteProduct } from "./actions";

export function DeleteProductButton({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  return (
    <ConfirmDelete
      title="Видалити товар?"
      description={`Товар "${productName}" буде видалено назавжди. Ця дія незворотня.`}
      action={() => deleteProduct(productId)}
    />
  );
}
