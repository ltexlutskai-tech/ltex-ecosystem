export const QUALITY_LEVELS = [
  "extra",
  "cream",
  "first",
  "second",
  "stock",
  "mix",
  "extra_first",
  "extra_cream",
  "first_second",
] as const;

export type QualityLevel = (typeof QUALITY_LEVELS)[number];

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  extra: "Екстра",
  cream: "Крем",
  first: "1й сорт",
  second: "2й сорт",
  stock: "Сток",
  mix: "Мікс",
  extra_first: "Екстра + 1й сорт",
  extra_cream: "Екстра + Крем",
  first_second: "1й + 2й сорт",
};
