"use client";

import { ArrowLeftRight } from "lucide-react";
import { useComparison, type ComparisonItem } from "@/lib/comparison";

export function ComparisonButton({ product }: { product: ComparisonItem }) {
  const { addItem, removeItem, isInComparison, itemCount } = useComparison();
  const isComparing = isInComparison(product.productId);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isComparing) {
      removeItem(product.productId);
    } else {
      addItem(product);
    }
  }

  if (!isComparing && itemCount >= 3) return null;

  return (
    <button
      onClick={toggle}
      className={`rounded-full bg-white/90 p-2 shadow-md transition-colors hover:bg-white ${
        isComparing ? "text-blue-500" : "text-gray-400 hover:text-blue-400"
      }`}
      aria-label={isComparing ? "Прибрати з порівняння" : "Порівняти"}
    >
      <ArrowLeftRight className="h-4 w-4" />
    </button>
  );
}
