import type { Metadata } from "next";
import { APP_NAME, CONTACTS } from "@ltex/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@ltex/ui";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

export const metadata: Metadata = {
  title: "Контакти — L-TEX секонд хенд та сток гуртом",
  description: `Контакти L-TEX: ${CONTACTS.phones.join(", ")}. Telegram ${CONTACTS.telegram}. ${CONTACTS.location}. Гуртовий продаж секонд хенду, стоку, іграшок, Bric-a-Brac від 10 кг.`,
};

export default function ContactsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: APP_NAME,
    description:
      "Гуртовий продаж секонд хенду, стоку, іграшок та Bric-a-Brac від 10 кг",
    telephone: CONTACTS.phones[0],
    email: CONTACTS.email,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Піддубці",
      addressRegion: "Волинська область",
      addressCountry: "UA",
    },
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Breadcrumbs items={[{ label: dict.nav.contacts }]} />

      <h1 className="mt-4 text-3xl font-bold">{dict.contacts.title}</h1>
      <p className="mt-2 text-gray-500">
        {dict.contacts.subtitle}
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{dict.contacts.phoneTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {CONTACTS.phones.map((phone) => (
              <a
                key={phone}
                href={`tel:${phone.replace(/\s/g, "")}`}
                className="block text-lg font-medium text-green-700 hover:underline"
              >
                {phone}
              </a>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{dict.contacts.messengersTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <a
              href={`https://t.me/${CONTACTS.telegram.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-lg font-medium text-green-700 hover:underline"
            >
              Telegram {CONTACTS.telegram}
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{dict.contacts.emailTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <a
              href={`mailto:${CONTACTS.email}`}
              className="block text-lg font-medium text-green-700 hover:underline"
            >
              {CONTACTS.email}
            </a>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg">{dict.contacts.addressTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg">{CONTACTS.location}</p>
            <p className="mt-2 text-sm text-gray-500">
              {dict.contacts.workHours}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-12 rounded-lg border bg-green-50 p-8 text-center">
        <h2 className="text-xl font-bold text-green-800">
          {dict.contacts.wholesaleFrom}
        </h2>
        <p className="mt-2 text-green-700">
          {dict.contacts.wholesaleDesc}
        </p>
      </div>
    </div>
  );
}
