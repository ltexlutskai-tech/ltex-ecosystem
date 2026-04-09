export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import type { PromoStripe } from "@ltex/db";
import { Button, Input, Textarea } from "@ltex/ui";
import { AdminBreadcrumbs } from "@/components/admin/breadcrumbs";
import { savePromoStripe } from "./actions";

async function loadPromoStripe(): Promise<PromoStripe | null> {
  try {
    return await prisma.promoStripe.findFirst();
  } catch {
    return null;
  }
}

export default async function PromoStripeAdminPage() {
  const stripe = await loadPromoStripe();

  const text = stripe?.text ?? "";
  const ctaLabel = stripe?.ctaLabel ?? "";
  const ctaHref = stripe?.ctaHref ?? "";
  const bgColor = stripe?.bgColor ?? "#dc2626";
  const textColor = stripe?.textColor ?? "#ffffff";
  const isActive = stripe?.isActive ?? false;

  return (
    <div className="space-y-6">
      <AdminBreadcrumbs items={[{ label: "Гаряча пропозиція" }]} />

      <div>
        <h1 className="text-2xl font-bold">Гаряча пропозиція</h1>
        <p className="mt-1 text-sm text-gray-500">
          Смужка над шапкою сайту з промо-повідомленням. Показується всім
          відвідувачам, коли увімкнена.
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">
          Попередній перегляд
        </h2>
        <div
          className="w-full rounded-md text-center text-sm font-medium"
          style={{ backgroundColor: bgColor, color: textColor }}
        >
          <div className="container mx-auto flex items-center justify-center gap-3 px-4 py-2">
            <span>{text || "Ваш промо-текст тут"}</span>
            {ctaHref && ctaLabel && (
              <span className="underline">{ctaLabel}</span>
            )}
          </div>
        </div>
      </div>

      <form
        action={savePromoStripe}
        className="max-w-2xl space-y-4 rounded-lg border bg-white p-6"
      >
        <div>
          <label
            htmlFor="promo-text"
            className="mb-1 block text-sm font-medium"
          >
            Текст *
          </label>
          <Textarea
            id="promo-text"
            name="text"
            defaultValue={text}
            rows={2}
            maxLength={300}
            required
            placeholder="Знижка -20% на всі товари до кінця тижня!"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="promo-cta-label"
              className="mb-1 block text-sm font-medium"
            >
              Текст кнопки
            </label>
            <Input
              id="promo-cta-label"
              name="ctaLabel"
              defaultValue={ctaLabel}
              maxLength={100}
              placeholder="Дивитись акцію"
            />
          </div>
          <div>
            <label
              htmlFor="promo-cta-href"
              className="mb-1 block text-sm font-medium"
            >
              Посилання
            </label>
            <Input
              id="promo-cta-href"
              name="ctaHref"
              defaultValue={ctaHref}
              maxLength={500}
              placeholder="/sale"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="promo-bg-color"
              className="mb-1 block text-sm font-medium"
            >
              Колір фону
            </label>
            <div className="flex items-center gap-2">
              <input
                id="promo-bg-color"
                name="bgColor"
                type="color"
                defaultValue={bgColor}
                className="h-10 w-16 cursor-pointer rounded border border-gray-300"
              />
              <span className="font-mono text-sm text-gray-600">{bgColor}</span>
            </div>
          </div>
          <div>
            <label
              htmlFor="promo-text-color"
              className="mb-1 block text-sm font-medium"
            >
              Колір тексту
            </label>
            <div className="flex items-center gap-2">
              <input
                id="promo-text-color"
                name="textColor"
                type="color"
                defaultValue={textColor}
                className="h-10 w-16 cursor-pointer rounded border border-gray-300"
              />
              <span className="font-mono text-sm text-gray-600">
                {textColor}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="promo-active"
            name="isActive"
            defaultChecked={isActive}
            className="h-4 w-4"
          />
          <label htmlFor="promo-active" className="text-sm">
            Увімкнути показ на сайті
          </label>
        </div>

        <div className="flex gap-2">
          <Button type="submit">Зберегти</Button>
        </div>
      </form>
    </div>
  );
}
