import type { Metadata } from "next";
import { APP_NAME } from "@ltex/shared";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

export const metadata: Metadata = {
  title: `${dict.privacy.metaTitle} | ${APP_NAME}`,
  description: dict.privacy.metaDescription,
  alternates: { canonical: `${SITE_URL}/privacy` },
  robots: { index: true, follow: true },
};

// TODO(L-TEX legal): замінити placeholder-секції на текст, погоджений юристом,
// перед публічним анонсом сторінки.
export default function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Breadcrumbs items={[{ label: dict.privacy.title }]} />
      <h1 className="mt-4 text-3xl font-bold">{dict.privacy.title}</h1>
      <p className="mt-2 text-sm italic text-gray-500">
        {dict.privacy.placeholder}
      </p>

      <div className="mt-6 space-y-6 text-gray-700">
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">
            {dict.privacy.dataCollected}
          </h2>
          <p>{dict.privacy.dataCollectedText}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.privacy.purpose}</h2>
          <p>{dict.privacy.purposeText}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.privacy.storage}</h2>
          <p>{dict.privacy.storageText}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.privacy.sharing}</h2>
          <p>{dict.privacy.sharingText}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.privacy.rights}</h2>
          <p>{dict.privacy.rightsText}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.privacy.cookies}</h2>
          <p>{dict.privacy.cookiesText}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.privacy.contacts}</h2>
          <p>{dict.privacy.contactsText}</p>
        </section>
      </div>
    </div>
  );
}
