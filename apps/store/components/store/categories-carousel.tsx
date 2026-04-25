"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getCategoryDisplay } from "@/lib/category-display";
import { productsLabel } from "@/lib/pluralize";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

const AUTO_ROTATE_MS = 6000;

export interface CategoryCarouselItem {
  id: string;
  slug: string;
  name: string;
  productCount: number;
}

interface CategoriesCarouselProps {
  categories: CategoryCarouselItem[];
}

export function CategoriesCarousel({ categories }: CategoriesCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const total = categories.length;

  const scrollToIndex = useCallback((i: number) => {
    const track = trackRef.current;
    const card = cardRefs.current[i];
    if (!track || !card) return;
    const left = card.offsetLeft - track.offsetLeft;
    track.scrollTo({ left, behavior: "smooth" });
  }, []);

  const goTo = useCallback(
    (i: number) => {
      if (total === 0) return;
      const next = ((i % total) + total) % total;
      setCurrentIndex(next);
      scrollToIndex(next);
    },
    [total, scrollToIndex],
  );

  const next = useCallback(() => goTo(currentIndex + 1), [goTo, currentIndex]);
  const prev = useCallback(() => goTo(currentIndex - 1), [goTo, currentIndex]);

  useEffect(() => {
    if (isPaused || total <= 1) return;
    const id = setInterval(() => {
      setCurrentIndex((i) => {
        const nextIndex = (i + 1) % total;
        scrollToIndex(nextIndex);
        return nextIndex;
      });
    }, AUTO_ROTATE_MS);
    return () => clearInterval(id);
  }, [isPaused, total, scrollToIndex]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    }
  };

  if (total === 0) return null;

  return (
    <section className="mt-12" aria-label={dict.home.categoriesCarousel.aria}>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {dict.home.categoriesCarousel.title}
        </h2>
        <div className="hidden gap-2 md:flex">
          <button
            type="button"
            onClick={prev}
            aria-label={dict.home.categoriesCarousel.prev}
            data-testid="category-carousel-prev"
            className="rounded-full border bg-white p-2 text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label={dict.home.categoriesCarousel.next}
            data-testid="category-carousel-next"
            className="rounded-full border bg-white p-2 text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        role="region"
        aria-roledescription="carousel"
        tabIndex={0}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocus={() => setIsPaused(true)}
        onBlur={() => setIsPaused(false)}
        onKeyDown={handleKeyDown}
        data-testid="category-carousel-track"
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 scroll-smooth scrollbar-thin focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-lg"
      >
        {categories.map((cat, i) => {
          const display = getCategoryDisplay(cat.slug);
          const Icon = display.icon;
          return (
            <Link
              key={cat.id}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              href={`/catalog/${cat.slug}`}
              data-testid={`category-card-${cat.slug}`}
              data-analytics="home-category-carousel-click"
              className="group block w-[66%] flex-shrink-0 snap-start sm:w-[33%] md:w-[25%]"
            >
              <div className="overflow-hidden rounded-lg border shadow-sm transition-shadow group-hover:shadow-lg">
                <div
                  className={`bg-gradient-to-br ${display.gradient} flex h-44 items-center justify-center sm:h-48`}
                >
                  <Icon
                    className="h-20 w-20 text-white drop-shadow-md"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </div>
                <div className="bg-white p-4">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-gray-900 group-hover:text-primary">
                    {cat.name}
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {productsLabel(cat.productCount)}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {total > 1 && (
        <div
          className="mt-6 flex justify-center gap-2"
          role="tablist"
          aria-label={dict.home.categoriesCarousel.aria}
        >
          {categories.map((cat, i) => {
            const isActive = i === currentIndex;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={dict.home.categoriesCarousel.goToSlide.replace(
                  "{n}",
                  String(i + 1),
                )}
                data-testid={`category-dot-${i}`}
                onClick={() => goTo(i)}
                className={
                  isActive
                    ? "h-2 w-8 rounded-full bg-primary transition-all"
                    : "h-2 w-2 rounded-full bg-gray-300 transition-all hover:bg-gray-400"
                }
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
