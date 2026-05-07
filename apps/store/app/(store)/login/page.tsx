import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { LoginForm } from "./login-form";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

export const metadata: Metadata = {
  title: `${dict.auth.loginTitle} — L-TEX`,
  description: dict.auth.loginIntro,
  robots: { index: false, follow: false },
};

interface LoginPageProps {
  searchParams: Promise<{ returnTo?: string }>;
}

function safeReturnTo(raw: string | undefined): string {
  if (!raw) return "/account";
  // Only allow same-origin paths.
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/account";
  return raw;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const sp = await searchParams;
  const customer = await getCurrentCustomer();
  const returnTo = safeReturnTo(sp.returnTo);
  if (customer) {
    redirect(returnTo);
  }

  return (
    <div className="container mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold sm:text-3xl">{dict.auth.loginTitle}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {dict.auth.loginIntro}
      </p>
      <div className="mt-8">
        <LoginForm returnTo={returnTo} />
      </div>
    </div>
  );
}
