# Session 77 — Login form UX polish

**Type:** Worker session (mini)
**Branch:** `claude/login-ux-{XXXX}`
**Goal:** Зробити login form (`/login` від S73) zручною: phone mask, inline validation, auto-format, disabled-button-while-invalid.

---

## ⚠️ HARD RULES

1. **DO NOT change login API.** Тільки UI/UX.
2. **DO NOT add new dependencies** (no `react-input-mask`, no `libphonenumber-js`). Все pure JS — формат простий: `+380 XX XXX XX XX`.
3. **DO NOT touch register flow** (немає registry — phone+name = signup).
4. Auto-strip non-digits/non-plus on input (graceful pasting).

---

## Current state

`apps/store/app/(store)/login/page.tsx` (S73) — базовий form з phone+name. Шапка "Увійти", input phone, input name, submit button. На submit POST `/api/auth/customer/login`.

---

## Tasks

### 1. Pure helper `formatPhone(input: string): string`

Реалізуй у `apps/store/lib/phone-format.ts`:

```typescript
/**
 * Normalizes input to canonical UA phone format `+380 XX XXX XX XX`.
 * - Accepts any digits/spaces/dashes/parens/+ — strips junk.
 * - Auto-prepends "+38" if user typed `0XXX...` (10 digits starting with 0).
 * - Auto-prepends "+" if user typed `380...`.
 * - Truncates to max length (12 digits including country code).
 * - Inserts spaces at positions: +380 XX XXX XX XX
 */
export function formatPhone(input: string): string {
  // Strip everything except digits and leading +
  let digits = input.replace(/[^\d]/g, "");

  // Normalize country code
  if (digits.startsWith("0") && digits.length === 10) digits = "38" + digits;
  if (digits.length >= 10 && !digits.startsWith("38"))
    digits = "38" + digits.slice(-10);

  // Truncate to 12 digits (380 + 9-digit subscriber number)
  digits = digits.slice(0, 12);

  // Build groups: +380 XX XXX XX XX
  if (digits.length === 0) return "";
  if (digits.length <= 3) return "+" + digits;
  if (digits.length <= 5) return `+${digits.slice(0, 3)} ${digits.slice(3)}`;
  if (digits.length <= 8)
    return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`;
  if (digits.length <= 10)
    return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`;
}

/**
 * Returns digits only (e.g. "+380 67 671 05 15" → "380676710515").
 * For sending to API.
 */
export function phoneDigitsOnly(formatted: string): string {
  return formatted.replace(/[^\d]/g, "");
}

/**
 * Validates UA phone — must be exactly +380 + 9 digits = 12 digits total.
 */
export function isValidUaPhone(formatted: string): boolean {
  const d = phoneDigitsOnly(formatted);
  return d.startsWith("380") && d.length === 12;
}
```

### 2. Tests `lib/phone-format.test.ts`

```typescript
test("0671234567 → +380 67 123 45 67", () =>
  expect(formatPhone("0671234567")).toBe("+380 67 123 45 67"));
test("+380671234567 → formatted", () =>
  expect(formatPhone("+380671234567")).toBe("+380 67 123 45 67"));
test("380671234567 → formatted", () =>
  expect(formatPhone("380671234567")).toBe("+380 67 123 45 67"));
test("(067) 123-45-67 → cleans junk", () =>
  expect(formatPhone("(067) 123-45-67")).toBe("+380 67 123 45 67"));
test("partial: 067 → +380 67", () => expect(formatPhone("067")).toBe("+38 0")); // edge — adjust expectation
test("isValidUaPhone valid", () =>
  expect(isValidUaPhone("+380 67 123 45 67")).toBe(true));
test("isValidUaPhone too-short", () =>
  expect(isValidUaPhone("+380 67 123")).toBe(false));
test("isValidUaPhone non-UA", () =>
  expect(isValidUaPhone("+1 555 123 4567")).toBe(false));
```

(Перевір що partial-input edge cases не зривають input cursor — adjust thresholds якщо треба)

### 3. Update login form

`apps/store/app/(store)/login/page.tsx` (or its client form component):

```tsx
"use client";
import { useState } from "react";
import {
  formatPhone,
  phoneDigitsOnly,
  isValidUaPhone,
} from "@/lib/phone-format";

function LoginForm() {
  const [phoneRaw, setPhoneRaw] = useState("+380 ");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const phoneValid = isValidUaPhone(phoneRaw);
  const nameValid = name.trim().length >= 2;
  const canSubmit = phoneValid && nameValid && !submitting;

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatPhone(e.target.value);
    setPhoneRaw(formatted);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/customer/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phoneRaw, // server normalizes again, OK
          name: name.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 429) setError("Забагато спроб. Зачекайте хвилину.");
        else setError(data.error ?? "Помилка входу");
        return;
      }
      // Persist last-used name as autofill hint
      try {
        localStorage.setItem("ltex_customer_name_hint", name.trim());
      } catch {}
      window.location.href =
        new URL(window.location.href).searchParams.get("returnTo") ??
        "/account";
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div>
        <label className="block text-sm font-medium mb-1">Телефон</label>
        <input
          type="tel"
          value={phoneRaw}
          onChange={handlePhoneChange}
          placeholder="+380 XX XXX XX XX"
          autoComplete="tel"
          inputMode="tel"
          className={`w-full px-3 py-2 border rounded ${
            phoneRaw.length > 4 && !phoneValid
              ? "border-red-500"
              : "border-gray-300"
          }`}
        />
        {phoneRaw.length > 4 && !phoneValid && (
          <p className="text-xs text-red-600 mt-1">
            Введіть повний український номер
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Імʼя</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Іван"
          autoComplete="given-name"
          className={`w-full px-3 py-2 border rounded ${
            name.length > 0 && !nameValid ? "border-red-500" : "border-gray-300"
          }`}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full bg-emerald-600 text-white py-2 rounded font-medium disabled:bg-gray-300"
      >
        {submitting ? "Входжу..." : "Увійти"}
      </button>
    </form>
  );
}
```

### 4. Autofill name hint

На mount: `setName(localStorage.getItem("ltex_customer_name_hint") ?? "")`. Це покращує repeat-flow після clear cookies.

### 5. Update existing /login tests якщо є

`app/(store)/login/page.test.tsx` (якщо існує) — додати тести:

- typing "0671234567" → input shows "+380 67 123 45 67"
- submit button disabled поки not valid
- 429 response → "Забагато спроб..." error inline

---

## Acceptance criteria

- [ ] `pnpm format:check`/`typecheck`/`test`/`build` зелені
- [ ] `lib/phone-format.ts` + 7+ tests
- [ ] Login form має phone mask, validation borders, disabled button until valid
- [ ] Pasting `(067) 123-45-67` → auto-cleans
- [ ] Existing API call shape unchanged (server still normalizes phone)
- [ ] Push на `claude/login-ux-{XXXX}` (НЕ merge!)

---

## User-action post-merge

`.\scripts\deploy.ps1` — UI-only redeploy

---

## Reference

- `apps/store/app/(store)/login/page.tsx` — S73 baseline
- `apps/store/app/api/auth/customer/login/route.ts` — server normalization (lines ~174-177)
