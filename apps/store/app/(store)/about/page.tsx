import type { Metadata } from "next";
import { APP_NAME, CONTACTS, COUNTRIES, COUNTRY_LABELS, MIN_ORDER_KG, QUALITY_LEVELS, QUALITY_LABELS } from "@ltex/shared";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { Button } from "@ltex/ui";
import { MapPin, Phone, Mail, MessageCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Про нас — L-TEX",
  description:
    "L-TEX — український гуртовий склад секонд хенду, стоку, іграшок та Bric-a-Brac. Піддубці, Волинь. Працюємо з 2015 року.",
};

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-6">
      <Breadcrumbs items={[{ label: "Про нас" }]} />

      {/* Hero */}
      <section className="mt-6">
        <h1 className="text-3xl font-bold sm:text-4xl">{APP_NAME}</h1>
        <p className="mt-3 max-w-2xl text-lg text-gray-600">
          Ми — українська гуртова компанія, що спеціалізується на продажу
          секонд хенду, стоку (нового надлишкового товару), іграшок та Bric-a-Brac.
          Працюємо з покупцями по всій Україні від {MIN_ORDER_KG} кг.
        </p>
      </section>

      {/* What we sell */}
      <section className="mt-10">
        <h2 className="text-2xl font-bold">Що ми продаємо</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: "Секонд хенд",
              desc: "Якісний одяг, взуття та аксесуари з Європи — сортований за якістю та сезоном.",
            },
            {
              title: "Сток (Stock)",
              desc: "Нові товари з надлишків виробництва та нерозпроданих колекцій. Ціна нижча від роздрібу.",
            },
            {
              title: "Іграшки",
              desc: "Дитячі іграшки гуртом — м'які, пластикові, настільні ігри та інше.",
            },
            {
              title: "Bric-a-Brac",
              desc: "Побутові товари, декор, посуд, кухонне приладдя та інші корисні дрібниці.",
            },
            {
              title: "Взуття",
              desc: "Жіноче, чоловіче та дитяче взуття — кросівки, черевики, босоніжки, чоботи.",
            },
            {
              title: "Аксесуари",
              desc: "Сумки, ремені, шарфи, головні убори та інші аксесуари.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border p-4">
              <h3 className="font-semibold text-green-700">{item.title}</h3>
              <p className="mt-1 text-sm text-gray-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Quality levels */}
      <section className="mt-10">
        <h2 className="text-2xl font-bold">Рівні якості</h2>
        <p className="mt-2 text-gray-600">
          Весь товар сортується за рівнями якості для вашої зручності:
        </p>
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
        <h2 className="text-2xl font-bold">Країни-постачальники</h2>
        <p className="mt-2 text-gray-600">
          Ми працюємо напряму з постачальниками з:
        </p>
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
        <h2 className="text-2xl font-bold">Чому обирають нас</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {[
            "Відеоогляди на YouTube для кожного товару — бачите що купуєте",
            "Мінімальне замовлення від 10 кг — зручно для малого бізнесу",
            "Швидка відправка Новою Поштою та Делівері по всій Україні",
            "Прозорі ціни в EUR з актуальним курсом",
            "Широкий асортимент — від одягу до іграшок та Bric-a-Brac",
            "Особистий підхід — консультація через Telegram",
          ].map((text) => (
            <div key={text} className="flex gap-2">
              <span className="mt-0.5 text-green-600">&#10003;</span>
              <span className="text-gray-700">{text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className="mt-10 rounded-lg bg-green-50 p-6">
        <h2 className="text-2xl font-bold">Контакти</h2>
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
              Написати в Telegram
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/catalog">Перейти до каталогу</a>
          </Button>
        </div>
      </section>
    </div>
  );
}
