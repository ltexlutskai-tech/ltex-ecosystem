import { Button } from "@ltex/ui";
import Link from "next/link";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

export default function NotFound() {
  return (
    <div className="container mx-auto flex flex-col items-center justify-center px-4 py-32 text-center">
      <h1 className="text-6xl font-bold">{dict.errors.notFoundCode}</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        {dict.errors.notFound}
      </p>
      <Button className="mt-8" asChild>
        <Link href="/">{dict.errors.toHome}</Link>
      </Button>
    </div>
  );
}
