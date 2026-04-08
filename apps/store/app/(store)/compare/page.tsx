"use client";

import Link from "next/link";
import { Button, Badge } from "@ltex/ui";
import {
  QUALITY_LABELS,
  SEASON_LABELS,
  COUNTRY_LABELS,
  PRICE_UNIT_LABELS,
  type QualityLevel,
} from "@ltex/shared";
import { useComparison } from "@/lib/comparison";
import { ArrowLeftRight, Trash2 } from "lucide-react";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

export default function ComparePage() {
  const { items, removeItem, clearAll } = useComparison();

  if (items.length < 2) {
    return (
      <div className="container mx-auto flex flex-col items-center px-4 py-16 text-center">
        <ArrowLeftRight className="h-12 w-12 text-gray-300" />
        <h1 className="mt-4 text-2xl font-bold">{dict.compare.title}</h1>
        <p className="mt-2 text-gray-500">
          {dict.compare.minItems}
        </p>
        <Button className="mt-6" asChild>
          <Link href="/catalog">{dict.cart.toCatalog}</Link>
        </Button>
      </div>
    );
  }

  const rows: { label: string; values: string[] }[] = [
    {
      label: dict.product.quality,
      values: items.map(
        (i) =>
          QUALITY_LABELS[i.quality as QualityLevel] ?? i.quality,
      ),
    },
    {
      label: dict.product.season,
      values: items.map(
        (i) => SEASON_LABELS[i.season] ?? dict.product.allSeason,
      ),
    },
    {
      label: dict.product.country,
      values: items.map(
        (i) =>
          COUNTRY_LABELS[i.country as keyof typeof COUNTRY_LABELS] ??
          i.country ||
          "-",
      ),
    },
    {
      label: dict.product.priceUnit,
      values: items.map(
        (i) =>
          PRICE_UNIT_LABELS[i.priceUnit as keyof typeof PRICE_UNIT_LABELS] ??
          i.priceUnit,
      ),
    },
    {
      label: dict.product.priceEur,
      values: items.map((i) =>
        i.priceEur !== null ? `€${i.priceEur.toFixed(2)}` : "-",
      ),
    },
  ];

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{dict.compare.title}</h1>
        <button
          onClick={clearAll}
          className="text-sm text-red-500 hover:underline"
        >
          {dict.compare.clearAll}
        </button>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[500px] text-sm">
          <thead>
            <tr className="border-b">
              <th className="w-32 px-4 py-3 text-left font-medium text-gray-500">
                {dict.compare.productLabel}
              </th>
              {items.map((item) => (
                <th key={item.productId} className="px-4 py-3">
                  <div className="flex flex-col items-center gap-2">
                    <div className="relative h-32 w-32 overflow-hidden rounded-lg bg-gray-100">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-gray-400">
                          {dict.compare.photo}
                        </div>
                      )}
                    </div>
                    <Link
                      href={`/product/${item.slug}`}
                      className="text-center font-medium hover:text-green-700"
                    >
                      {item.name}
                    </Link>
                    <button
                      onClick={() => removeItem(item.productId)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const allSame = row.values.every((v) => v === row.values[0]);
              return (
                <tr key={row.label} className="border-b">
                  <td className="px-4 py-3 font-medium text-gray-500">
                    {row.label}
                  </td>
                  {row.values.map((value, i) => (
                    <td
                      key={i}
                      className={`px-4 py-3 text-center ${
                        !allSame ? "bg-yellow-50 font-medium" : ""
                      }`}
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
