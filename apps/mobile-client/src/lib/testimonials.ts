/**
 * Static testimonial data for the mobile HomeScreen TestimonialsCarousel.
 *
 * Mirrors apps/store/lib/testimonials.ts. Keep in sync manually when the web
 * copy is updated until/unless we move the source-of-truth to the database.
 */

export type TestimonialSource = "google" | "instagram" | "manual";

export interface Testimonial {
  id: string;
  name: string;
  rating: 1 | 2 | 3 | 4 | 5;
  date: string;
  text: string;
  source: TestimonialSource;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    id: "olena-k-2026-03",
    name: "Олена К.",
    rating: 5,
    date: "2026-03-12",
    text: "Замовляли вже не вперше — якість одягу на висоті, відеоогляди допомагають обирати. Менеджери на зв'язку, відправка швидка.",
    source: "google",
  },
  {
    id: "andriy-p-2026-02",
    name: "Андрій П.",
    rating: 5,
    date: "2026-02-28",
    text: "Беремо стоковий товар від L-TEX вже понад рік. Прозорі ціни в EUR, актуальний курс, мінімум 10 кг — зручно для нашого магазину.",
    source: "google",
  },
  {
    id: "mariya-l-2026-02",
    name: "Марія Л.",
    rating: 5,
    date: "2026-02-05",
    text: "Дуже рекомендую! Сортування по якості чітке, мікс мішки збалансовані. Bric-a-Brac — окрема знахідка для нашої точки.",
    source: "google",
  },
  {
    id: "igor-s-2026-01",
    name: "Ігор С.",
    rating: 4,
    date: "2026-01-19",
    text: "Беру іграшки гуртом — асортимент оновлюється часто. Чесна вага, штрихкоди на кожному мішку, легко звіряти з накладною.",
    source: "google",
  },
  {
    id: "nataliya-v-2025-12",
    name: "Наталія В.",
    rating: 5,
    date: "2025-12-08",
    text: "Працюємо з L-TEX другий рік. Завжди чесна якість як на відео, оперативна відправка Новою Поштою. Дякуємо за надійність!",
    source: "google",
  },
];
