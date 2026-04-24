import type { Metadata } from "next";
import { APP_NAME } from "@ltex/shared";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

export const metadata: Metadata = {
  title: `${dict.returns.metaTitle} | ${APP_NAME}`,
  description: dict.returns.metaDescription,
  alternates: { canonical: `${SITE_URL}/returns` },
  robots: { index: true, follow: true },
};

// TODO(L-TEX legal): замінити placeholder-секції на текст, погоджений юристом,
// перед публічним анонсом сторінки.
export default function ReturnsPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Breadcrumbs items={[{ label: dict.returns.title }]} />
      <h1 className="mt-4 text-3xl font-bold">{dict.returns.title}</h1>
      <p className="mt-2 text-sm italic text-gray-500">
        {dict.returns.placeholder}
      </p>

      <div className="mt-6 space-y-6 text-gray-700">
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.returns.conditions}</h2>
          <p>{dict.returns.conditionsText}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.returns.terms}</h2>
          <p>{dict.returns.termsText}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.returns.procedure}</h2>
          <p>{dict.returns.procedureText}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.returns.exceptions}</h2>
          <p>{dict.returns.exceptionsText}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.returns.contacts}</h2>
          <p>{dict.returns.contactsText}</p>
        </section>
      </div>
    </div>
  );
}
