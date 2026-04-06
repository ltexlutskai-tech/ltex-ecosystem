import { Button } from "@ltex/ui";
import { APP_NAME, MIN_ORDER_KG } from "@ltex/shared";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-16">
      <section className="flex flex-col items-center text-center gap-8">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          {APP_NAME}
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground sm:text-xl">
          Гуртовий продаж секонд хенду, стоку, іграшок та Bric-a-Brac від{" "}
          {MIN_ORDER_KG} кг. Одяг, взуття, аксесуари з Англії, Німеччини,
          Канади та Польщі.
        </p>
        <div className="flex gap-4">
          <Button size="lg" asChild>
            <Link href="/catalog">Каталог</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/lots">Лоти (мішки)</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
