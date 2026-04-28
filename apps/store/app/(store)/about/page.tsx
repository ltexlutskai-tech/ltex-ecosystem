import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  APP_NAME,
  CONTACTS,
  COUNTRIES,
  COUNTRY_LABELS,
  MIN_ORDER_KG,
  QUALITY_LEVELS,
  QUALITY_LABELS,
} from "@ltex/shared";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { Button } from "@ltex/ui";
import { MapPin, Phone, Mail, MessageCircle } from "lucide-react";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

export const metadata: Metadata = {
  title: dict.about.metaTitle,
  description:
    "L-TEX — український гуртовий склад секонд хенду, стоку, іграшок та Bric-a-Brac. Піддубці, Волинь. Працюємо з 2015 року.",
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Що таке секонд хенд гуртом?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Секонд хенд гуртом — це продаж вживаного одягу, взуття та аксесуарів великими партіями (від 10 кг). L-TEX пропонує товар з Англії, Німеччини, Канади та Польщі, відсортований за якістю.",
      },
    },
    {
      "@type": "Question",
      name: "Яке мінімальне замовлення в L-TEX?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Мінімальне замовлення — від 10 кг. Це зручно для малого бізнесу, магазинів секонд хенду та підприємців.",
      },
    },
    {
      "@type": "Question",
      name: "Як здійснюється доставка?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Доставка здійснюється Новою Поштою та Делівері по всій Україні. Відправка протягом 1-2 робочих днів після підтвердження замовлення.",
      },
    },
    {
      "@type": "Question",
      name: "Що таке сток (Stock)?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Сток — це нові товари з надлишків виробництва та нерозпроданих колекцій. Вони ніколи не були у вжитку, але ціна значно нижча від роздрібу.",
      },
    },
    {
      "@type": "Question",
      name: "Які рівні якості існують?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "L-TEX пропонує 6 рівнів якості: Екстра (найкраща якість), Крем, 1й сорт, 2й сорт, Сток (новий) та Мікс. Кожен лот має відеоогляд на YouTube.",
      },
    },
  ],
};

export default async function AboutPage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <div className="container mx-auto px-4 py-6">
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Breadcrumbs items={[{ label: dict.nav.about }]} />

      {/* Hero */}
      <section className="mt-6">
        <h1 className="text-3xl font-bold sm:text-4xl">{APP_NAME}</h1>
        <p className="mt-3 max-w-2xl text-lg text-gray-600">
          {dict.about.heroText.replace("{min}", String(MIN_ORDER_KG))}
        </p>
      </section>

      {/* What we sell */}
      <section className="mt-10">
        <h2 className="text-2xl font-bold">{dict.about.whatWeSell}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dict.about.sellItems.map((item) => (
            <div key={item.title} className="rounded-lg border p-4">
              <h3 className="font-semibold text-green-700">{item.title}</h3>
              <p className="mt-1 text-sm text-gray-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Quality levels */}
      <section className="mt-10">
        <h2 className="text-2xl font-bold">{dict.about.qualityLevels}</h2>
        <p className="mt-2 text-gray-600">{dict.about.qualityText}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {QUALITY_LEVELS.map((q) => (
            <span
              key={q}
              className="rounded-full bg-green-100 px-4 py-1.5 text-sm font-medium text-green-800"
            >
              {QUALITY_LABELS[q]}
            </span>
          ))}
        </div>
      </section>

      {/* Countries */}
      <section className="mt-10">
        <h2 className="text-2xl font-bold">{dict.about.supplierCountries}</h2>
        <p className="mt-2 text-gray-600">{dict.about.supplierText}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COUNTRIES.map((c) => (
            <div
              key={c}
              className="flex items-center gap-2 rounded-lg border p-3"
            >
              <MapPin className="h-5 w-5 text-green-600" />
              <span className="font-medium">{COUNTRY_LABELS[c]}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Why us */}
      <section className="mt-10">
        <h2 className="text-2xl font-bold">{dict.about.whyUs}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {dict.about.whyUsReasons.map((text) => (
            <div key={text} className="flex gap-2">
              <span className="mt-0.5 text-green-600">&#10003;</span>
              <span className="text-gray-700">{text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className="mt-10 rounded-lg bg-green-50 p-6">
        <h2 className="text-2xl font-bold">{dict.about.contactsTitle}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-green-600" />
            <span>{CONTACTS.location}</span>
          </div>
          <div className="flex items-center gap-3">
            <MessageCircle className="h-5 w-5 text-green-600" />
            <a
              href={`https://t.me/${CONTACTS.telegram.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-700 underline"
            >
              Telegram {CONTACTS.telegram}
            </a>
          </div>
          {CONTACTS.phones.map((phone) => (
            <div key={phone} className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-green-600" />
              <a
                href={`tel:${phone.replace(/\s/g, "")}`}
                className="text-green-700 underline"
              >
                {phone}
              </a>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-green-600" />
            <a
              href={`mailto:${CONTACTS.email}`}
              className="text-green-700 underline"
            >
              {CONTACTS.email}
            </a>
          </div>
        </div>

        <div className="mt-6 flex gap-4">
          <Button asChild>
            <a
              href={`https://t.me/${CONTACTS.telegram.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {dict.about.writeToTelegram}
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/catalog">{dict.about.goToCatalog}</a>
          </Button>
        </div>
      </section>
    </div>
  );
}
