"use client";

import Link from "next/link";
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@ltex/ui";
import { APP_NAME, CONTACTS } from "@ltex/shared";
import { CartBadge } from "@/components/store/cart-badge";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { href: "/catalog", label: "Каталог" },
  { href: "/lots", label: "Лоти" },
  { href: "/about", label: "Про нас" },
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
          <nav aria-label="Основна навігація" className="hidden gap-6 md:flex">
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
          <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
            <a
              href={`https://t.me/${CONTACTS.telegram.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Telegram
            </a>
          </Button>

          {/* Mobile menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Меню">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle className="text-left text-xl font-bold text-primary">
                  {APP_NAME}
                </SheetTitle>
              </SheetHeader>
              <nav aria-label="Мобільна навігація" className="mt-6 flex flex-col gap-4">
                {NAV_LINKS.map((link) => (
                  <SheetClose key={link.href} asChild>
                    <Link
                      href={link.href}
                      className="text-lg font-medium transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <Link
                    href="/cart"
                    className="text-lg font-medium transition-colors hover:text-primary"
                  >
                    Кошик
                  </Link>
                </SheetClose>
              </nav>
              <div className="mt-8 space-y-3 border-t pt-6">
                {CONTACTS.phones.map((phone) => (
                  <a
                    key={phone}
                    href={`tel:${phone.replace(/\s/g, "")}`}
                    className="block text-sm font-medium"
                  >
                    {phone}
                  </a>
                ))}
                <a
                  href={`https://t.me/${CONTACTS.telegram.replace("@", "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm font-medium text-primary"
                >
                  Telegram {CONTACTS.telegram}
                </a>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
