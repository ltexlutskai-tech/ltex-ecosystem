"use client";

import { useComparison, type ComparisonItem } from "@/lib/comparison";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

export function CompareCheckbox({ product }: { product: ComparisonItem }) {
  const { addItem, removeItem, isInComparison, itemCount } = useComparison();
  const isComparing = isInComparison(product.productId);
  const disabled = !isComparing && itemCount >= 3;

  function toggle(e: React.ChangeEvent<HTMLInputElement>) {
    e.stopPropagation();
    if (isComparing) {
      removeItem(product.productId);
    } else {
      addItem(product);
    }
  }

  return (
    <label
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className={`flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-xs shadow-md transition-colors hover:bg-white ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
      aria-label={
        isComparing ? dict.compare.removeFromCompare : dict.compare.addToCompare
      }
    >
      <input
        type="checkbox"
        checked={isComparing}
        disabled={disabled}
        onChange={toggle}
        onClick={(e) => e.stopPropagation()}
        className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-1 focus:ring-blue-500"
        data-testid="compare-checkbox"
      />
      <span className="font-medium text-gray-700">{dict.compare.compare}</span>
    </label>
  );
}
