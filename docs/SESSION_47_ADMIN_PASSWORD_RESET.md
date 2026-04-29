# Session 47 — Worker Task: Admin Password Reset Flow

**Створено orchestrator-ом:** 2026-04-29
**Пріоритет:** P1 (admin lockout risk — user забув пароль, на login-сторінці немає recovery flow)
**Очікуваний ефорт:** 1.5–2 години
**Тип:** worker session

---

## Контекст

Поточний `/admin/login` (`apps/store/app/admin/login/page.tsx`) робить тільки `supabase.auth.signInWithPassword`. Якщо адмін забуде пароль — **немає UI шляху скинути**. Єдина опція — Supabase Dashboard (manual reset). Це блокер для production-режиму, де доступ до Dashboard може бути не у всіх.

Додатково при спробі `Send password recovery` з Dashboard у поточному стані **email link редіректить на `localhost:3000`** замість `https://new.ltex.com.ua` — бо **Site URL** у Supabase Auth налаштована на dev. Recovery callback не обробляється на сайті взагалі (немає сторінки) — навіть з правильним Site URL юзер опинявся б на `/` з access_token у URL hash без UI зміни паролю.

S47 додає повноцінний flow:

1. `/admin/login` → "Забули пароль?" link
2. `/admin/forgot-password` → форма email → `resetPasswordForEmail()` → success message
3. `/admin/reset-password` → callback handler (читає recovery token з URL hash, дозволяє ввести новий пароль) → `updateUser({ password })` → redirect на `/admin`
4. Документація: як виправити Site URL + Redirect URLs allowlist у Supabase Dashboard

**Auth НЕ міняємо** — лишається Supabase Auth (per CLAUDE.md: "Supabase Auth (admin login) ... лишаються активні"). Custom HMAC JWT — то для mobile, його не чіпаємо.

---

## Branch

`claude/admin-password-reset-WnIKL` від main. **Гілка вже існує локально** (створена user-ом з UI). Worker:

```bash
git fetch origin
git checkout claude/admin-password-reset-WnIKL  # або create -B якщо тільки локально
git rebase origin/main  # синк з main
```

---

## Hard rules

1. **НЕ замінювати Supabase Auth на щось інше** — admin login має залишитись на `supabase.auth.signInWithPassword`. Recovery flow теж через Supabase (`resetPasswordForEmail` + `updateUser`).
2. **НЕ чіпати mobile auth** (`lib/mobile-auth.ts`, custom HMAC JWT) — це інша підсистема.
3. **НЕ додавати rate-limit middleware** на нові routes — Supabase Auth сам має internal rate limit на recovery emails (один email раз на 60 секунд). Якщо потрібен extra rate-limit — окрема сесія.
4. **НЕ показувати у UI чи існує email** — і успіх, і "user not found" завжди відображаються як "Якщо такий email зареєстрований — лист відправлено" (захист від email enumeration).
5. **`/admin/reset-password` має бути client-side page** — Supabase кладе recovery token у URL hash (`#access_token=...&type=recovery`), а hash недоступний на сервері. Використовуй `useEffect` + `supabase.auth.getSession()` для його обробки (Supabase JS auto-парсить hash при init).
6. **Middleware (`apps/store/middleware.ts`)** — `/admin/forgot-password` і `/admin/reset-password` мають бути **public** (не вимагати auth), як `/admin/login`. Перевір existing exclusion list і додай.
7. **Локалізація:** усі тексти українською, у тон з існуючою login-сторінкою ("Адмін-панель", "Увійти" і т.д.).
8. **Стилі:** використовувати ті самі компоненти `@ltex/ui` (`Button`, `Input`) і ті самі Tailwind-патерни що `/admin/login` (зелений `text-green-700`, `max-w-sm`, `border bg-white`).
9. **`format:check` + `typecheck` + `test` + `build` мають проходити** перед push. 0 нових `any`. Strict TS.
10. **НЕ забути:** додати E2E happy-path test (Playwright) на flow `forgot-password → reset-password redirect → form rendered`. Sending real email і фактичний reset не тестуємо (потребує live Supabase).

---

## Файли

### 1. `apps/store/app/admin/login/page.tsx` — додати посилання

Між `{error && <p ...>}` і `<Button>` (або під `<Button>`, на смак worker-а) додати:

```tsx
<div className="text-center">
  <a
    href="/admin/forgot-password"
    className="text-sm text-green-700 hover:underline"
  >
    Забули пароль?
  </a>
</div>
```

### 2. `apps/store/app/admin/forgot-password/page.tsx` (new)

Client-component, форма з одним полем email. Сабміт викликає:

```ts
const supabase = createClient();
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/admin/reset-password`,
});
```

UI states:
- `idle` — форма
- `loading` — disabled button "Відправляємо..."
- `submitted` — success message **завжди** (не показувати чи юзер існує): _"Якщо такий email зареєстрований в адмін-панелі — лист з посиланням на скидання паролю відправлено. Перевірте пошту (та папку Спам)."_ + кнопка "Назад до входу".

Помилки від Supabase (network, etc.) — generic message _"Не вдалося відправити лист. Спробуйте пізніше."_

### 3. `apps/store/app/admin/reset-password/page.tsx` (new)

Client-component. Mount logic:

```ts
useEffect(() => {
  const supabase = createClient();
  // Supabase JS auto-парсить hash на init → session з'являється
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) {
      // Token відсутній або прострочений
      setStatus("invalid");
    } else {
      setStatus("ready");
    }
  });
}, []);
```

UI states:
- `loading` — спінер "Перевіряємо посилання..."
- `invalid` — _"Посилання недійсне або прострочене. Запросіть нове на сторінці [Забули пароль?](/admin/forgot-password)."_
- `ready` — форма: 2 поля (`password`, `confirmPassword`) + submit
- `success` — _"Пароль успішно змінено. Перенаправлення..."_ + `setTimeout(() => router.push("/admin"), 1500)`

Submit:
```ts
if (password !== confirmPassword) { setError("Паролі не співпадають"); return; }
if (password.length < 8) { setError("Мінімум 8 символів"); return; }
const { error } = await supabase.auth.updateUser({ password });
if (error) setError(error.message); else setStatus("success");
```

### 4. `apps/store/middleware.ts` — додати exclusions

Знайти existing блок що exclude-ить `/admin/login` з admin-auth gate. Додати `/admin/forgot-password` і `/admin/reset-password` у той же список.

(Worker сам читає поточний middleware і вирішує — чи це regex `^/admin/(login|forgot-password|reset-password)$`, чи масив. Не вгадую формат.)

### 5. `apps/store/e2e/admin-password-reset.spec.ts` (new) — E2E happy-path

```ts
import { test, expect } from "@playwright/test";

test("forgot-password page renders + back link works", async ({ page }) => {
  await page.goto("/admin/login");
  await page.click('text="Забули пароль?"');
  await expect(page).toHaveURL(/\/admin\/forgot-password/);
  await expect(page.getByRole("heading")).toContainText("Скидання паролю");
});

test("reset-password page shows invalid state without token", async ({ page }) => {
  await page.goto("/admin/reset-password");
  await expect(page.getByText(/недійсне або прострочене/i)).toBeVisible();
});
```

(Реальний email-based flow не тестуємо — потребує live Supabase + inbox API.)

### 6. `docs/DEPLOYMENT.md` — додати секцію "Supabase Auth — Site URL config"

В кінці файлу (або під розділом "Перший deploy") додати:

```md
## Supabase Auth — Site URL налаштування

Recovery emails (`/admin/forgot-password`) генерують посилання на основі
**Site URL** з Supabase Dashboard. Якщо Site URL = `http://localhost:3000`,
адмін отримає лист з непрацюючим посиланням.

**Один раз після першого deploy:**

1. Supabase Dashboard → проект L-TEX → **Authentication → URL Configuration**
2. **Site URL:** `https://new.ltex.com.ua`
3. **Redirect URLs (allowlist):** додати `https://new.ltex.com.ua/**`
4. Save.

Після цього кнопка "Забули пароль?" на `/admin/login` працює end-to-end.
```

### 7. `docs/HISTORY.md` — completion report

Стандартний формат за прикладом S46. Що змінилось, скільки файлів, тести.

---

## Acceptance criteria

- [ ] `/admin/login` показує посилання "Забули пароль?" і веде на `/admin/forgot-password`
- [ ] `/admin/forgot-password` форма submit викликає `resetPasswordForEmail` з правильним `redirectTo`
- [ ] `/admin/forgot-password` після submit показує однаковий success message незалежно чи email існує
- [ ] `/admin/reset-password` без token → state "invalid" з лінком назад на forgot-password
- [ ] `/admin/reset-password` з валідним token → форма password/confirm → submit → redirect `/admin`
- [ ] Validation: password >= 8 chars, паролі співпадають
- [ ] Middleware не редіректить `/admin/forgot-password` та `/admin/reset-password` на `/admin/login`
- [ ] DEPLOYMENT.md має секцію про Site URL
- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm -r build` — green
- [ ] E2E `admin-password-reset.spec.ts` — passes
- [ ] 0 нових `any`
- [ ] HISTORY.md оновлено

---

## Що НЕ входить у скоуп S47

- Зміна Site URL у Supabase (це user-action, не код)
- Custom email templates (Supabase default templates ОК)
- 2FA / TOTP для адмінки
- Rate limiting на forgot-password endpoint
- Audit log змін паролю
- Email enumeration test (вимагає live SMTP)

---

## Push + handoff

```bash
git add -A
git commit -m "feat(admin): password reset flow via Supabase Auth recovery email"
git push -u origin claude/admin-password-reset-WnIKL
```

Orchestrator після завершення:
1. Перевірити CI green на гілці
2. Merge в main
3. Видалити merged branch
4. Підказати user-у виконати Supabase Dashboard steps з DEPLOYMENT.md секції (one-time)
5. Оновити SESSION_TASKS.md (видалити цю задачу, якщо була)
