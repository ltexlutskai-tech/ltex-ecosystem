"use client";

import Link from "next/link";
import { Button } from "@ltex/ui";
import { useComparison } from "@/lib/comparison";
import { X, ArrowLeftRight } from "lucide-react";

export function ComparisonBar() {
  const { items, removeItem, clearAll } = useComparison();

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 shadow-lg backdrop-blur">
      <div className="container mx-auto flex items-center gap-4 px-4 py-3">
        <ArrowLeftRight className="h-5 w-5 shrink-0 text-blue-500" />
        <div className="flex flex-1 gap-3 overflow-x-auto">
          {items.map((item) => (
            <div
              key={item.productId}
              className="flex shrink-0 items-center gap-2 rounded-md border bg-gray-50 px-3 py-1"
            >
              <span className="max-w-[120px] truncate text-sm">
                {item.name}
              </span>
              <button
                onClick={() => removeItem(item.productId)}
                className="text-gray-400 hover:text-red-500"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={clearAll}
            className="text-sm text-gray-500 hover:text-red-500"
          >
            Очистити
          </button>
          {items.length >= 2 && (
            <Button size="sm" asChild>
              <Link href="/compare">Порівняти ({items.length})</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
