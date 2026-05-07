"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { useCustomer } from "@/lib/customer-context";
import { eurToUah, formatUah } from "@/lib/exchange-rate";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

export interface PriceOrLoginProps {
  /** Wholesale EUR price. `null` / `undefined` → render either CTA or nothing. */
  priceEur?: number | null;
  /** Optional sale price (EUR). Wins over the wholesale price when present. */
  salePriceEur?: number | null;
  /** Current EUR→UAH rate. When supplied, UAH is shown as the primary line. */
  rate?: number;
  /** "kg" | "pair" | "piece" — controls per-unit suffix on the price. */
  priceUnit?: string;
  /** Hide the per-unit suffix entirely. */
  hideUnit?: boolean;
  /** Visual size variant. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

function unitSuffix(priceUnit: string | undefined): string {
  if (priceUnit === "pair") return dict.catalog.perPiece;
  if (priceUnit === "piece") return dict.catalog.perPiece;
  return dict.catalog.perKg;
}

const SIZE_CLASSES = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
} as const;

const PRIMARY_CLASSES = {
  sm: "text-base font-bold",
  md: "text-lg font-bold",
  lg: "text-xl font-bold",
} as const;

export function PriceOrLogin({
  priceEur,
  salePriceEur,
  rate,
  priceUnit,
  hideUnit,
  size = "md",
  className,
}: PriceOrLoginProps) {
  const customer = useCustomer();
  const effectivePrice =
    salePriceEur != null && salePriceEur > 0 ? salePriceEur : priceEur;
  const hasPrice = typeof effectivePrice === "number" && effectivePrice > 0;

  if (!hasPrice) {
    if (customer) {
      // Authenticated user but no price configured for this product — stay silent
      // rather than showing a misleading CTA.
      return null;
    }
    return (
      <Link
        href="/login"
        data-analytics="price-login-cta"
        className={`inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 font-medium text-emerald-800 transition hover:bg-emerald-100 ${SIZE_CLASSES[size]} ${className ?? ""}`}
      >
        <Lock className="h-3.5 w-3.5" aria-hidden />
        {dict.auth.priceLoginPrompt}
      </Link>
    );
  }

  const showUah = typeof rate === "number" && rate > 0;
  const uahText = showUah
    ? formatUah(eurToUah(effectivePrice as number, rate))
    : null;
  const suffix = hideUnit ? null : `/${unitSuffix(priceUnit)}`;

  return (
    <div className={className}>
      {uahText ? (
        <>
          <p className={`${PRIMARY_CLASSES[size]} text-red-600`}>
            {uahText}
            {suffix && (
              <span className="text-xs font-normal text-gray-500">
                {suffix}
              </span>
            )}
          </p>
          <p className="text-xs text-gray-400">
            €{(effectivePrice as number).toFixed(2)}
          </p>
        </>
      ) : (
        <p className={`${PRIMARY_CLASSES[size]} text-green-700`}>
          €{(effectivePrice as number).toFixed(2)}
          {suffix && (
            <span className="text-xs font-normal text-gray-500">{suffix}</span>
          )}
        </p>
      )}
    </div>
  );
}
