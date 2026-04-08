import type { Metadata } from "next";
import { APP_NAME, CONTACTS } from "@ltex/shared";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "L-TEX — Секонд хенд та сток гуртом",
    template: "%s | L-TEX",
  },
  description:
    "Гуртовий продаж секонд хенду, стоку, іграшок та Bric-a-Brac від 10 кг. Одяг, взуття, аксесуари з Англії, Німеччини, Канади, Польщі. Доставка по Україні.",
  keywords: [
    "секонд хенд гуртом",
    "секонд хенд оптом",
    "сток оптом",
    "сток гуртом Україна",
    "іграшки гуртом секонд хенд",
    "bric a brac оптом",
    "second hand wholesale ukraine",
    "одяг гуртом",
    "взуття секонд хенд оптом",
  ],
  openGraph: {
    title: "L-TEX — Секонд хенд та сток гуртом",
    description:
      "Гуртовий продаж секонд хенду, стоку, іграшок та Bric-a-Brac від 10 кг. Доставка по Україні.",
    url: SITE_URL,
    siteName: "L-TEX",
    locale: "uk_UA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "L-TEX — Секонд хенд та сток гуртом",
    description:
      "Гуртовий продаж секонд хенду, стоку, іграшок та Bric-a-Brac від 10 кг. Доставка по Україні.",
  },
  alternates: {
    canonical: SITE_URL,
    languages: {
      "uk-UA": SITE_URL,
    },
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: APP_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/icon-512.png`,
  description:
    "Гуртовий продаж секонд хенду, стоку, іграшок та Bric-a-Brac від 10 кг. Україна.",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Піддубці",
    addressRegion: "Волинська область",
    addressCountry: "UA",
  },
  contactPoint: {
    "@type": "ContactPoint",
    telephone: CONTACTS.phones[0],
    contactType: "sales",
    availableLanguage: ["Ukrainian"],
  },
  email: CONTACTS.email,
  sameAs: [
    `https://t.me/${CONTACTS.telegram.replace("@", "")}`,
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="alternate" hrefLang="uk" href={SITE_URL} />
        <link rel="alternate" hrefLang="x-default" href={SITE_URL} />
      </head>
      <body className="font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        {children}
      </body>
    </html>
  );
}
