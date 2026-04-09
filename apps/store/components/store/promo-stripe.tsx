import Link from "next/link";
import { getActivePromoStripe } from "@/lib/promo-stripe";

export async function PromoStripe() {
  const stripe = await getActivePromoStripe().catch(() => null);
  if (!stripe) return null;

  return (
    <div
      className="w-full text-center text-sm font-medium"
      style={{ backgroundColor: stripe.bgColor, color: stripe.textColor }}
    >
      <div className="container mx-auto flex items-center justify-center gap-3 px-4 py-2">
        <span>{stripe.text}</span>
        {stripe.ctaHref && stripe.ctaLabel && (
          <Link
            href={stripe.ctaHref}
            className="underline hover:no-underline"
            data-analytics="promo-stripe-cta"
          >
            {stripe.ctaLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
