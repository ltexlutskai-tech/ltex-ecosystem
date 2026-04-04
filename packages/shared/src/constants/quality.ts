export const QUALITY_LEVELS = [
  "extra",
  "cream",
  "first",
  "second",
  "stock",
  "mix",
] as const;

export type QualityLevel = (typeof QUALITY_LEVELS)[number];

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  extra: "Екстра",
  cream: "Крем",
  first: "1й сорт",
  second: "2й сорт",
  stock: "Сток",
  mix: "Мікс",
};
