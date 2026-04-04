import { Button } from "@ltex/ui";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container mx-auto flex flex-col items-center justify-center px-4 py-32 text-center">
      <h1 className="text-6xl font-bold">404</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Сторінку не знайдено
      </p>
      <Button className="mt-8" asChild>
        <Link href="/">На головну</Link>
      </Button>
    </div>
  );
}
