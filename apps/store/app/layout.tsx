import type { Metadata } from "next";
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
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk">
      <body className="font-sans">{children}</body>
    </html>
  );
}
