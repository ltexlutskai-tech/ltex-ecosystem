import type { Config } from "tailwindcss";
import baseConfig from "@ltex/ui/tailwind.config";

const config: Config = {
  ...baseConfig,
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    // `lib/` містить рядкові Tailwind-класи (напр. кольори світлофора клієнтів
    // у lib/manager/client-color.ts) — без сканування вони не потрапляють у CSS.
    "./lib/**/*.{ts,tsx}",
    "../../packages/ui/components/**/*.{ts,tsx}",
    "../../packages/ui/lib/**/*.{ts,tsx}",
  ],
  // Кольори світлофора клієнтів (крапки + підсвітка рядків) конструюються
  // рядком у lib/manager/client-color.ts — гарантуємо їх генерацію.
  safelist: [
    "bg-green-500",
    "bg-yellow-400",
    "bg-white",
    "ring-1",
    "ring-gray-400",
    "bg-pink-300",
    "bg-red-500",
    "bg-pink-500",
    "bg-green-100",
    "bg-yellow-100",
    "bg-pink-50",
    "bg-red-100",
    "bg-pink-100",
    "text-amber-500",
    "bg-amber-500",
  ],
};

export default config;
