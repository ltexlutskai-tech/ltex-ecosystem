import Link from "next/link";
import { Separator } from "@ltex/ui";
import { APP_NAME, CONTACTS, CATEGORIES } from "@ltex/shared";
import { Send } from "lucide-react";
import {
  FacebookIcon,
  InstagramIcon,
  YoutubeIcon,
} from "@/components/store/social-icons";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

// TODO(L-TEX social): замінити placeholder-handles (ltex) на реальні profile URLs
// після створення офіційних акаунтів на Facebook / Instagram / YouTube.
const SOCIAL_LINKS = [
  {
    href: "https://facebook.com/ltex",
    label: "Facebook",
    Icon: FacebookIcon,
  },
  {
    href: "https://instagram.com/ltex",
    label: "Instagram",
    Icon: InstagramIcon,
  },
  {
    href: "https://youtube.com/@ltex",
    label: "YouTube",
    Icon: YoutubeIcon,
  },
] as const;

export function Footer() {
  const telegramUrl = `https://t.me/${CONTACTS.telegram.replace("@", "")}`;
  return (
    <footer className="border-t bg-secondary/50" role="contentinfo">
      <div className="container mx-auto px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <h3 className="text-lg font-bold text-primary">{APP_NAME}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {dict.footer.description}
            </p>

            <h4 className="mt-6 font-semibold">
              {dict.footerExtra.socialTitle}
            </h4>
            <ul className="mt-2 flex items-center gap-2">
              <li>
                <a
                  href={telegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={dict.footerExtra.telegram}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                </a>
              </li>
              {SOCIAL_LINKS.map(({ href, label, Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold">{dict.footer.categories}</h4>
            <ul className="mt-2 space-y-1">
              {CATEGORIES.map((cat) => (
                <li key={cat.slug}>
                  <Link
                    href={`/catalog/${cat.slug}`}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold">{dict.footer.navigation}</h4>
            <ul className="mt-2 space-y-1">
              <li>
                <Link
                  href="/catalog"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {dict.nav.catalog}
                </Link>
              </li>
              <li>
                <Link
                  href="/lots"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {dict.nav.lots} (мішки)
                </Link>
              </li>
              <li>
                <Link
                  href="/contacts"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {dict.nav.contacts}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold">{dict.footerExtra.infoTitle}</h4>
            <ul className="mt-2 space-y-1">
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {dict.footerExtra.terms}
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {dict.footerExtra.privacy}
                </Link>
              </li>
              <li>
                <Link
                  href="/returns"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {dict.footerExtra.returns}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold">{dict.footer.contactsTitle}</h4>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {CONTACTS.phones.map((phone) => (
                <li key={phone}>
                  <a
                    href={`tel:${phone.replace(/\s/g, "")}`}
                    className="hover:text-foreground"
                  >
                    {phone}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={`mailto:${CONTACTS.email}`}
                  className="hover:text-foreground"
                >
                  {CONTACTS.email}
                </a>
              </li>
              <li>
                <a
                  href={`https://t.me/${CONTACTS.telegram.replace("@", "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground"
                >
                  Telegram {CONTACTS.telegram}
                </a>
              </li>
              <li className="pt-1">{CONTACTS.location}</li>
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        <p className="text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} {APP_NAME}. {dict.footer.allRights}
        </p>
      </div>
    </footer>
  );
}
