"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Туторіал для НОВИХ покупців сайту (перший вхід після короткої реєстрації).
 *
 * Показується на каталозі, коли в URL є `?welcome=1` і туторіал ще не
 * переглянуто (localStorage `ltex:welcome-tour-done`). Кілька простих кроків
 * «як користуватись сайтом», кнопки Далі/Пропустити. Без сторонніх бібліотек.
 */

const LS_KEY = "ltex:welcome-tour-done";

const STEPS: { emoji: string; title: string; text: string }[] = [
  {
    emoji: "👋",
    title: "Вітаємо в L-TEX!",
    text: "Ми — оптовий склад секонд хенду, стоку, іграшок та Bric-a-Brac. Мінімальне замовлення — від 10 кг. Зараз швидко покажемо, як усе працює.",
  },
  {
    emoji: "🗂️",
    title: "Каталог і лоти",
    text: "У «Каталозі» — товари з цінами за кг. У розділі «Лоти» — конкретні мішки з вагою, штрихкодом і відеооглядом: те, що бачите на відео, те й отримаєте.",
  },
  {
    emoji: "🎬",
    title: "Відеоогляди",
    text: "Більшість позицій мають відеоогляд на YouTube. Натисніть на мініатюру відео у картці товару чи лота, щоб переглянути вміст мішка.",
  },
  {
    emoji: "🛒",
    title: "Кошик і замовлення",
    text: "Додавайте лоти або позиції у кошик (від 10 кг разом) і тисніть «Оформити замовлення». Менеджер вашої області звʼяжеться для підтвердження й доставки.",
  },
  {
    emoji: "💬",
    title: "Звʼязок з менеджером",
    text: "Питання? Телефонуйте +380 67 671 05 15 або пишіть у Telegram @L_TEX — підкажемо з асортиментом і цінами.",
  },
];

export function WelcomeTour() {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (searchParams.get("welcome") !== "1") return;
    try {
      if (localStorage.getItem(LS_KEY) === "1") return;
    } catch {}
    setOpen(true);
  }, [searchParams]);

  function finish() {
    try {
      localStorage.setItem(LS_KEY, "1");
    } catch {}
    setOpen(false);
  }

  if (!open) return null;

  const s = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <p className="text-4xl">{s.emoji}</p>
        <h2 className="mt-3 text-lg font-semibold text-gray-900">{s.title}</h2>
        <p className="mt-2 text-sm text-gray-600">{s.text}</p>

        <div className="mt-4 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-green-600" : "w-1.5 bg-gray-300"
              }`}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={finish}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Пропустити
          </button>
          <button
            type="button"
            onClick={() => (isLast ? finish() : setStep((v) => v + 1))}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            {isLast ? "Почати покупки" : "Далі"}
          </button>
        </div>
      </div>
    </div>
  );
}
