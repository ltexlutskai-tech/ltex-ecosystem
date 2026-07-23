"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Input } from "@ltex/ui";
import { UA_REGIONS } from "@/lib/constants/regions";
import { getDictionary } from "@/lib/i18n";
import { formatPhone, isValidUaPhone } from "@/lib/phone-format";

const dict = getDictionary();
const NAME_HINT_KEY = "ltex_customer_name_hint";
const PHONE_INITIAL = "+380 ";

export function LoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState(PHONE_INITIAL);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const phoneRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const hint = localStorage.getItem(NAME_HINT_KEY);
      if (hint) setName(hint);
    } catch {}
    phoneRef.current?.focus();
  }, []);

  const phoneValid = isValidUaPhone(phone);
  const nameValid = name.trim().length >= 2;
  const regionValid = region !== "";
  const phoneShowError = phone.length > PHONE_INITIAL.length && !phoneValid;
  const nameShowError = name.length > 0 && !nameValid;
  const canSubmit = phoneValid && nameValid && regionValid && !isSubmitting;

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPhone(formatPhone(e.target.value));
    setError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/customer/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          name: name.trim(),
          region,
        }),
      });
      if (res.status === 429) {
        setError(dict.auth.rateLimited);
        setIsSubmitting(false);
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? dict.auth.networkError);
        setIsSubmitting(false);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        created?: boolean;
      };
      try {
        localStorage.setItem(NAME_HINT_KEY, name.trim());
      } catch {}
      // Нового покупця ведемо на каталог із туторіалом «як користуватись»;
      // наявного — куди йшов (returnTo).
      if (data.created) {
        router.replace("/catalog?welcome=1");
      } else {
        router.replace(returnTo);
      }
      router.refresh();
    } catch {
      setError(dict.auth.networkError);
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label
          htmlFor="login-phone"
          className="text-sm font-medium leading-none"
        >
          {dict.auth.phoneLabel}
        </label>
        <Input
          id="login-phone"
          ref={phoneRef}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={dict.auth.phonePlaceholder}
          value={phone}
          onChange={handlePhoneChange}
          required
          disabled={isSubmitting}
          aria-invalid={phoneShowError || undefined}
          aria-describedby={phoneShowError ? "login-phone-error" : undefined}
          className={
            phoneShowError ? "border-red-500 focus-visible:ring-red-500" : ""
          }
        />
        {phoneShowError && (
          <p id="login-phone-error" className="text-xs text-red-600">
            {dict.auth.invalidPhone}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="login-name"
          className="text-sm font-medium leading-none"
        >
          {dict.auth.nameLabel}
        </label>
        <Input
          id="login-name"
          type="text"
          autoComplete="name"
          placeholder={dict.auth.namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={isSubmitting}
          aria-invalid={nameShowError || undefined}
          className={
            nameShowError ? "border-red-500 focus-visible:ring-red-500" : ""
          }
        />
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="login-region"
          className="text-sm font-medium leading-none"
        >
          {dict.auth.regionLabel}
        </label>
        <select
          id="login-region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          required
          disabled={isSubmitting}
          autoComplete="address-level1"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">{dict.auth.regionPlaceholder}</option>
          {UA_REGIONS.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <Button
        type="submit"
        disabled={!canSubmit}
        aria-disabled={!canSubmit}
        className="w-full"
      >
        {isSubmitting ? dict.auth.submitting : dict.auth.submit}
      </Button>
      <div className="text-center text-sm">
        <Link href="/" className="text-muted-foreground underline">
          {dict.auth.backToHome}
        </Link>
      </div>
    </form>
  );
}
