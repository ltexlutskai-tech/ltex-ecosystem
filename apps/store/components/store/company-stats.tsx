"use client";

import { useCounter } from "@/lib/use-counter";
import { getDictionary } from "@/lib/i18n";

interface Stat {
  value: number;
  suffix: string;
  label: string;
}

const STATS: Stat[] = [
  { value: 11, suffix: "+ років", label: "stats.yearsLabel" },
  { value: 3000, suffix: "+", label: "stats.customersLabel" },
  { value: 4, suffix: "", label: "stats.countriesLabel" },
];

function StatCard({ stat }: { stat: Stat }) {
  const dict = getDictionary();
  const { value, ref } = useCounter<HTMLDivElement>({
    target: stat.value,
    durationMs: 1500,
  });
  const labelKey = stat.label.split(".")[1];
  const label =
    (labelKey && (dict.stats as unknown as Record<string, string>)[labelKey]) ||
    "";
  return (
    <div ref={ref} className="text-center">
      <div className="text-4xl font-bold text-primary tabular-nums sm:text-5xl">
        {value.toLocaleString("uk-UA")}
        {stat.suffix}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function CompanyStats() {
  const dict = getDictionary();
  return (
    <section className="mt-12 rounded-lg border bg-secondary/30 py-10">
      <div className="mx-auto max-w-4xl px-4">
        <h2 className="mb-8 text-center text-2xl font-bold">
          {dict.stats.title}
        </h2>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {STATS.map((stat) => (
            <StatCard key={stat.label} stat={stat} />
          ))}
        </div>
      </div>
    </section>
  );
}
