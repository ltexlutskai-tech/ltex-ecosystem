export type TestimonialSource = "google" | "instagram" | "manual";

export interface Testimonial {
  name: string;
  rating: 1 | 2 | 3 | 4 | 5;
  date: string;
  text: string;
  source: TestimonialSource;
}

// TODO(L-TEX content): User — скопіюй 5 топ-відгуків з Google reviews
// (https://share.google/agHbowjiDBGRAdue6) сюди вручну після deploy.
// Поточний контент — placeholder в стилі типових B2B-відгуків.
export const TESTIMONIALS: Testimonial[] = [
  {
    name: "Олена К.",
    rating: 5,
    date: "2026-03-12",
    text: "Замовляли вже не вперше — якість одягу на висоті, відеоогляди допомагають обирати. Менеджери на зв'язку, відправка швидка.",
    source: "google",
  },
  {
    name: "Андрій П.",
    rating: 5,
    date: "2026-02-28",
    text: "Беремо стоковий товар від L-TEX вже понад рік. Прозорі ціни в EUR, актуальний курс, мінімум 10 кг — зручно для нашого магазину.",
    source: "google",
  },
  {
    name: "Марія Л.",
    rating: 5,
    date: "2026-02-05",
    text: "Дуже рекомендую! Сортування по якості чітке, мікс мішки збалансовані. Bric-a-Brac — окрема знахідка для нашої точки.",
    source: "google",
  },
  {
    name: "Ігор С.",
    rating: 4,
    date: "2026-01-19",
    text: "Беру іграшки гуртом — асортимент оновлюється часто. Чесна вага, штрихкоди на кожному мішку, легко звіряти з накладною.",
    source: "google",
  },
  {
    name: "Наталія В.",
    rating: 5,
    date: "2025-12-08",
    text: "Працюємо з L-TEX другий рік. Завжди чесна якість як на відео, оперативна відправка Новою Поштою. Дякуємо за надійність!",
    source: "google",
  },
];

export const GOOGLE_REVIEWS_URL = "https://share.google/agHbowjiDBGRAdue6";
