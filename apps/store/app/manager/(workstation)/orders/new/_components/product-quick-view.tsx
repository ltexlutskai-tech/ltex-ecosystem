"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ltex/ui";

interface PreviewData {
  id: string;
  code1C: string | null;
  articleCode: string | null;
  name: string;
  slug: string;
  description: string;
  priceUnit: string;
  averageWeight: number | null;
  videoUrl: string | null;
  characteristics: {
    quality: string | null;
    season: string | null;
    country: string | null;
    gender: string | null;
    sizes: string | null;
    producer: string | null;
    unitsPerKg: string | null;
    unitWeight: string | null;
  };
  images: { url: string; alt: string }[];
  prices: { priceType: string; amount: number; currency: string }[];
  stock: { lots: number; weightKg: number; quantityPcs: number };
}

const CHAR_LABELS: Record<string, string> = {
  quality: "Якість",
  season: "Сезон",
  country: "Країна",
  gender: "Стать",
  sizes: "Розміри",
  producer: "Виробник",
  unitsPerKg: "Одиниць/кг",
  unitWeight: "Вага одиниці",
};

const PRICE_LABELS: Record<string, string> = {
  wholesale: "Ціна продажу",
  akciya: "Акційна",
};

/**
 * Швидкий перегляд товару у діалозі (з вікна підбору): фото, опис, характеристики,
 * складський залишок, ціни. Тільки частина інформації — повний перегляд у картці.
 */
export function ProductQuickView({
  productId,
  onClose,
}: {
  productId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeImg, setActiveImg] = useState(0);

  useEffect(() => {
    if (!productId) {
      setData(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setActiveImg(0);
    fetch(`/api/v1/manager/products/${productId}/preview`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`preview ${r.status}`);
        return r.json();
      })
      .then((json: PreviewData) => setData(json))
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== "AbortError") {
          setError("Не вдалося завантажити перегляд");
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [productId]);

  const chars = data
    ? (Object.entries(data.characteristics).filter(
        ([, v]) => v != null && String(v).trim() !== "",
      ) as [string, string][])
    : [];

  return (
    <Dialog
      open={!!productId}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6">
            {data?.name ?? "Швидкий перегляд"}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="p-6 text-sm text-gray-500">Завантаження…</div>
        )}
        {error && <div className="p-6 text-sm text-red-600">{error}</div>}

        {data && !loading && (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto">
            {/* Фото */}
            {data.images.length > 0 ? (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.images[activeImg]?.url}
                  alt={data.images[activeImg]?.alt || data.name}
                  className="max-h-64 w-full rounded-lg border bg-gray-50 object-contain"
                />
                {data.images.length > 1 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {data.images.map((im, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActiveImg(i)}
                        className={`h-14 w-14 overflow-hidden rounded-md border ${
                          i === activeImg
                            ? "border-green-500 ring-1 ring-green-500"
                            : "border-gray-200"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={im.url}
                          alt={im.alt || ""}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center rounded-lg border bg-gray-50 text-sm text-gray-400">
                Немає фото
              </div>
            )}

            {/* Артикул / код */}
            <div className="text-xs text-gray-500">
              Артикул: {data.articleCode ?? "—"}
              {data.code1C ? ` · Код 1С: ${data.code1C}` : ""}
            </div>

            {/* Складський залишок */}
            <div className="grid grid-cols-3 gap-2 rounded-lg border bg-gray-50 p-3 text-center">
              <div>
                <div className="text-lg font-semibold text-gray-900">
                  {data.stock.weightKg.toLocaleString("uk-UA")}
                </div>
                <div className="text-xs text-gray-500">кг у залишку</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-gray-900">
                  {data.stock.quantityPcs.toLocaleString("uk-UA")}
                </div>
                <div className="text-xs text-gray-500">шт/пар</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-gray-900">
                  {data.stock.lots}
                </div>
                <div className="text-xs text-gray-500">лотів</div>
              </div>
            </div>

            {/* Ціни */}
            {data.prices.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {data.prices.map((pr, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm"
                  >
                    <span className="text-gray-500">
                      {PRICE_LABELS[pr.priceType] ?? pr.priceType}:
                    </span>
                    <span className="font-semibold text-gray-800">
                      {pr.amount} {pr.currency === "EUR" ? "€" : pr.currency}
                    </span>
                  </span>
                ))}
              </div>
            )}

            {/* Характеристики */}
            {chars.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                {chars.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-gray-400">
                      {CHAR_LABELS[k] ?? k}
                    </dt>
                    <dd className="text-gray-800">{v}</dd>
                  </div>
                ))}
                {data.averageWeight != null && (
                  <div>
                    <dt className="text-xs text-gray-400">Середня вага</dt>
                    <dd className="text-gray-800">{data.averageWeight} кг</dd>
                  </div>
                )}
              </dl>
            )}

            {/* Опис */}
            {data.description && (
              <div>
                <div className="mb-1 text-xs font-medium text-gray-400">
                  Опис
                </div>
                <p className="whitespace-pre-line text-sm text-gray-700">
                  {data.description}
                </p>
              </div>
            )}

            <div className="border-t pt-3">
              <a
                href={`/manager/prices/${data.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Відкрити повну картку
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
