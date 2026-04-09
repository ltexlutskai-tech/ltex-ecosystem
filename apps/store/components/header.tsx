"use client";

import Link from "next/link";
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@ltex/ui";
import { APP_NAME, CONTACTS } from "@ltex/shared";
import { CartBadge } from "@/components/store/cart-badge";
import { WishlistBadge } from "@/components/store/wishlist-badge";
import { SearchAutocomplete } from "@/components/store/search-autocomplete";
import { Menu, MessageCircle, Send } from "lucide-react";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

const NAV_LINKS = [
  { href: "/catalog", label: dict.nav.catalog, analytics: undefined },
  { href: "/lots", label: dict.nav.lots, analytics: undefined },
  { href: "/new", label: dict.nav.new, analytics: "header-nav-new" },
  { href: "/sale", label: dict.nav.sale, analytics: "header-nav-sale" },
  { href: "/about", label: dict.nav.about, analytics: undefined },
  { href: "/contacts", label: dict.nav.contacts, analytics: undefined },
] as const;

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center gap-4 px-4">
        {/* Left: logo + nav */}
        <div className="flex flex-shrink-0 items-center gap-6 lg:gap-8">
          <Link href="/" className="text-xl font-bold text-primary">
            {APP_NAME}
          </Link>
          <nav aria-label="Основна навігація" className="hidden gap-6 lg:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                data-analytics={link.analytics}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Center: global search (hidden on mobile) */}
        <div className="hidden flex-1 justify-center md:flex">
          <div className="w-full max-w-md">
            <SearchAutocomplete placeholder={dict.header.searchPlaceholder} />
          </div>
        </div>

        {/* Right: actions */}
        <div className="ml-auto flex flex-shrink-0 items-center gap-2 md:ml-0 md:gap-3">
          <WishlistBadge />
          <CartBadge />
          <a
            href={`tel:${CONTACTS.phones[0]?.replace(/\s/g, "")}`}
            className="hidden text-sm font-medium xl:block"
          >
            {CONTACTS.phones[0]}
          </a>
          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label={dict.header.viberGroup}
            className="hidden sm:inline-flex"
          >
            <a
              href={CONTACTS.viberGroup}
              target="_blank"
              rel="noopener noreferrer"
              data-analytics="header-viber-group"
            >
              <MessageCircle className="h-5 w-5" />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label={dict.header.telegramGroup}
            className="hidden sm:inline-flex"
          >
            <a
              href={CONTACTS.telegramGroup}
              target="_blank"
              rel="noopener noreferrer"
              data-analytics="header-telegram-group"
            >
              <Send className="h-5 w-5" />
            </a>
          </Button>

          {/* Mobile menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label={dict.nav.menu}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle className="text-left text-xl font-bold text-primary">
                  {APP_NAME}
                </SheetTitle>
              </SheetHeader>
              <nav
                aria-label="Мобільна навігація"
                className="mt-6 flex flex-col gap-4"
              >
                {NAV_LINKS.map((link) => (
                  <SheetClose key={link.href} asChild>
                    <Link
                      href={link.href}
                      data-analytics={link.analytics}
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
                    {dict.nav.cart}
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
                  href={CONTACTS.viberGroup}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-analytics="header-viber-group"
                  className="flex items-center gap-2 text-sm font-medium text-primary"
                >
                  <MessageCircle className="h-4 w-4" />
                  {dict.header.viberGroup}
                </a>
                <a
                  href={CONTACTS.telegramGroup}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-analytics="header-telegram-group"
                  className="flex items-center gap-2 text-sm font-medium text-primary"
                >
                  <Send className="h-4 w-4" />
                  {dict.header.telegramGroup}
                </a>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
