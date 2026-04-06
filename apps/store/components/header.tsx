import Link from "next/link";
import { Button } from "@ltex/ui";
import { APP_NAME, CONTACTS } from "@ltex/shared";
import { CartBadge } from "@/components/store/cart-badge";

const NAV_LINKS = [
  { href: "/catalog", label: "Каталог" },
  { href: "/lots", label: "Лоти" },
  { href: "/contacts", label: "Контакти" },
] as const;

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold text-primary">
            {APP_NAME}
          </Link>
          <nav className="hidden gap-6 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <CartBadge />
          <a
            href={`tel:${CONTACTS.phones[0]?.replace(/\s/g, "")}`}
            className="hidden text-sm font-medium lg:block"
          >
            {CONTACTS.phones[0]}
          </a>
          <Button variant="outline" size="sm" asChild>
            <a
              href={`https://t.me/${CONTACTS.telegram.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Telegram
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
