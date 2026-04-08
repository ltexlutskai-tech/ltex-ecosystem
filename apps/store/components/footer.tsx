import Link from "next/link";
import { Separator } from "@ltex/ui";
import { APP_NAME, CONTACTS, CATEGORIES } from "@ltex/shared";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

export function Footer() {
  return (
    <footer className="border-t bg-secondary/50" role="contentinfo">
      <div className="container mx-auto px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <h3 className="text-lg font-bold text-primary">{APP_NAME}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {dict.footer.description}
            </p>
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
          &copy; {new Date().getFullYear()} {APP_NAME}.{" "}
          {dict.footer.allRights}
        </p>
      </div>
    </footer>
  );
}
