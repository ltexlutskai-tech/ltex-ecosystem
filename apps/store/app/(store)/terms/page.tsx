import type { Metadata } from "next";
import { APP_NAME } from "@ltex/shared";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

export const metadata: Metadata = {
  title: `${dict.terms.metaTitle} | ${APP_NAME}`,
  description: dict.terms.metaDescription,
  alternates: { canonical: `${SITE_URL}/terms` },
  robots: { index: true, follow: true },
};

// TODO(L-TEX legal): замінити placeholder-секції на текст, погоджений юристом,
// перед публічним анонсом сторінки.
export default function TermsPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Breadcrumbs items={[{ label: dict.terms.title }]} />
      <h1 className="mt-4 text-3xl font-bold">{dict.terms.title}</h1>
      <p className="mt-2 text-sm italic text-gray-500">
        {dict.terms.placeholder}
      </p>

      <div className="mt-6 space-y-6 text-gray-700">
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.terms.general}</h2>
          <p>{dict.terms.generalText}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.terms.registration}</h2>
          <p>{dict.terms.registrationText}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.terms.orders}</h2>
          <p>{dict.terms.ordersText}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.terms.delivery}</h2>
          <p>{dict.terms.deliveryText}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.terms.liability}</h2>
          <p>{dict.terms.liabilityText}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.terms.changes}</h2>
          <p>{dict.terms.changesText}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.terms.contacts}</h2>
          <p>{dict.terms.contactsText}</p>
        </section>
      </div>
    </div>
  );
}
