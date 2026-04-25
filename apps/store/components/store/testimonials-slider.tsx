"use client";

import { useEffect, useState, useCallback } from "react";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";
import {
  TESTIMONIALS,
  GOOGLE_REVIEWS_URL,
  type Testimonial,
} from "@/lib/testimonials";
import { getDictionary } from "@/lib/i18n";

const MAX_TEXT_LENGTH = 200;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} з 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={
            i < rating
              ? "h-4 w-4 fill-yellow-400 text-yellow-400"
              : "h-4 w-4 text-gray-300"
          }
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function SourceBadge({ source }: { source: Testimonial["source"] }) {
  const label =
    source === "google"
      ? "Google"
      : source === "instagram"
        ? "Instagram"
        : "Відгук";
  return (
    <span className="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">
      {label}
    </span>
  );
}

export function TestimonialsSlider() {
  const dict = getDictionary();
  const [index, setIndex] = useState(0);

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % TESTIMONIALS.length);
  }, []);

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);
  }, []);

  useEffect(() => {
    if (TESTIMONIALS.length <= 1) return;
    const timer = setInterval(next, 6000);
    return () => clearInterval(timer);
  }, [next]);

  if (TESTIMONIALS.length === 0) return null;

  const current = TESTIMONIALS[index];
  if (!current) return null;

  return (
    <section className="mt-12">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold">{dict.testimonials.title}</h2>
      </div>

      <div className="relative mx-auto max-w-2xl rounded-lg border bg-background p-6 shadow-sm">
        <StarRating rating={current.rating} />
        <blockquote className="mt-4 text-base text-foreground">
          “{truncate(current.text, MAX_TEXT_LENGTH)}”
        </blockquote>
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{current.name}</span>
            <span>·</span>
            <time dateTime={current.date}>
              {new Date(current.date).toLocaleDateString("uk-UA", {
                year: "numeric",
                month: "long",
              })}
            </time>
          </div>
          <SourceBadge source={current.source} />
        </div>

        {TESTIMONIALS.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute -left-3 top-1/2 -translate-y-1/2 rounded-full border bg-background p-2 text-muted-foreground shadow-sm transition-colors hover:text-primary"
              aria-label="Попередній відгук"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute -right-3 top-1/2 -translate-y-1/2 rounded-full border bg-background p-2 text-muted-foreground shadow-sm transition-colors hover:text-primary"
              aria-label="Наступний відгук"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
        {TESTIMONIALS.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            className={`h-2 w-2 rounded-full transition-colors ${
              i === index ? "bg-primary" : "bg-muted"
            }`}
            aria-label={`Відгук ${i + 1}`}
          />
        ))}
      </div>

      <div className="mt-6 text-center">
        <a
          href={GOOGLE_REVIEWS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-primary hover:underline"
          data-analytics="testimonials-google-link"
        >
          {dict.testimonials.allReviews} →
        </a>
      </div>
    </section>
  );
}
