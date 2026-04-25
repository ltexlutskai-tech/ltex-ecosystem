import { getDictionary } from "@/lib/i18n";

const SUPPLIER_COUNTRIES = [
  { code: "GB", flag: "🇬🇧", key: "gb" },
  { code: "DE", flag: "🇩🇪", key: "de" },
  { code: "CA", flag: "🇨🇦", key: "ca" },
  { code: "PL", flag: "🇵🇱", key: "pl" },
] as const;

export function CountriesCarousel() {
  const dict = getDictionary();
  return (
    <section className="mt-12">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold">{dict.countries.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {dict.countries.subtitle}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SUPPLIER_COUNTRIES.map((country) => {
          const data = dict.countries[country.key];
          return (
            <div
              key={country.code}
              className="flex flex-col items-center rounded-lg border bg-background p-6 text-center transition-shadow hover:shadow-md"
              data-analytics="country-card"
              data-country={country.code}
            >
              <span className="text-5xl" role="img" aria-label={data.name}>
                {country.flag}
              </span>
              <h3 className="mt-3 font-semibold">{data.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
