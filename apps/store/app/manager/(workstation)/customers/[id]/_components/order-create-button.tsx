import Link from "next/link";
import { Plus } from "lucide-react";

export function OrderCreateButton({
  customerId,
}: {
  customerId?: string;
} = {}) {
  const href = customerId
    ? `/manager/orders/new?clientId=${encodeURIComponent(customerId)}`
    : "/manager/orders/new";
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      <Plus className="mr-1 h-4 w-4" />
      Створити замовлення
    </Link>
  );
}
