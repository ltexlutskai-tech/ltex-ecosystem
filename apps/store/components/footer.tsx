import Link from "next/link";
import { Separator } from "@ltex/ui";
import { APP_NAME, CONTACTS, CATEGORIES } from "@ltex/shared";
import { Send } from "lucide-react";
import {
  FacebookIcon,
  InstagramIcon,
  YoutubeIcon,
  TikTokIcon,
  ViberIcon,
} from "@/components/store/social-icons";
import { NewsletterForm } from "@/components/store/newsletter-form";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

const SOCIAL_LINKS = [
  {
    href: "https://t.me/LTEX_Second",
    label: "Telegram (Second + Stock)",
    Icon: Send,
  },
  {
    href: "https://t.me/LTEX_Bric",
    label: "Telegram (Bric-a-Brac)",
    Icon: Send,
  },
  {
    href: "https://bit.ly/4ahemp4",
    label: "Viber",
    Icon: ViberIcon,
  },
  {
    href: "https://instagram.com/ltex_secondopt",
    label: "Instagram",
    Icon: InstagramIcon,
  },
  {
    href: "https://www.facebook.com/groups/984605345078238",
    label: "Facebook",
    Icon: FacebookIcon,
  },
  {
    href: "https://www.tiktok.com/@ltex.second.opt",
    label: "TikTok",
    Icon: TikTokIcon,
  },
  {
    href: "https://youtube.com/@l-tex_second_stok",
    label: "YouTube",
    Icon: YoutubeIcon,
  },
] as const;

export function Footer() {
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
            <ul className="mt-2 flex flex-wrap items-center gap-2">
              {SOCIAL_LINKS.map(({ href, label, Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
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

        <div className="mx-auto max-w-xl">
          <NewsletterForm />
        </div>

        <Separator className="my-8" />

        <p className="text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} {APP_NAME}. {dict.footer.allRights}
        </p>
      </div>
    </footer>
  );
}
