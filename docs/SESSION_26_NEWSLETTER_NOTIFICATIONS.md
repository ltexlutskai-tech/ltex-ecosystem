# Session 26 — Worker Task: Newsletter Notifications

**Створено orchestrator-ом:** 2026-04-25
**Пріоритет:** P2 (homepage UX — newsletter активація)
**Очікуваний ефорт:** ~1 година
**Тип:** worker session (small / атомарний)

---

## Контекст

S23 додала newsletter signup form у footer + DB модель `NewsletterSubscriber` + `/api/newsletter` POST. Зараз він **просто зберігає email у DB** — нічого більше не відбувається.

User хоче (per ecosystem chat 2026-04-25):

1. **Admin notification bell** — incrementувати при новій підписці (як quote requests).
2. **Telegram chat менеджера** — відправити повідомлення `"Нова підписка на новинки: <email>"` через існуючий `services/telegram-bot/`. Env var `NEWSLETTER_TELEGRAM_CHAT_ID` (user задасть значення на сервері).
3. **Welcome email клієнту** — render тексту листа, **send no-op якщо email provider не налаштований** (P1 #9 ще не зроблено). Коли provider буде — email почне реально відправлятися без додаткового коду.

---

## Branch

`claude/session-26-newsletter-notifications` від main.

---

## Hard rules

1. **НЕ ламати CI** — `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm build` зелені
2. **НЕ ламати** existing flow: re-subscribe (повторна підписка вже відписаного) має продовжувати працювати; rate limit (5/IP/hour) лишається
3. **НЕ блокувати response** на await-ах нотифікацій — використати `void` + try/catch (відсутність email provider не повинна повертати 500 клієнту)
4. **НЕ вимагати** обов'язковий env var для Telegram chat — якщо `NEWSLETTER_TELEGRAM_CHAT_ID` не задано → log warning, skip (як вже зроблено для інших опціональних)
5. **i18n**: текст welcome email шаблону у `apps/store/lib/i18n/uk.ts` під ключем `newsletter.welcomeEmail.*`
6. Використати **existing infrastructure**:
   - `apps/store/lib/notifications.ts` — додати `notifyNewsletterSubscribe(email, source)` поряд з existing `notifyManagerOrder`
   - `apps/store/lib/email.ts` (якщо існує) — додати `sendWelcomeNewsletterEmail(email)` з no-op якщо `SMTP_HOST` / `RESEND_API_KEY` не задано
   - Existing admin notification mechanism — той що вже використовується для new orders / quotes (треба знайти і переюзати)

---

## Open questions (worker — питати orchestrator якщо неясно)

1. Якщо у проекті немає окремого `email.ts` — створити новий `apps/store/lib/email-newsletter.ts` (а не wrap у lib/notifications.ts).
2. Admin notification mechanism — швидше за все `getAdminStats()` або `notification-bell.tsx` має лічильник `pendingX`. Знайти аналог для newsletter або додати новий field `newSubscribersCount` (за останню добу).

---

## Tasks

### Task 1: Telegram notification

**Файл:** `apps/store/lib/notifications.ts` (extend existing)

Додати функцію:

```ts
export async function notifyNewsletterSubscribe(payload: {
  email: string;
  source?: string;
  subscribedAt: Date;
}): Promise<void> {
  const chatId = process.env.NEWSLETTER_TELEGRAM_CHAT_ID;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!chatId || !botToken) {
    console.info(
      "[L-TEX] NEWSLETTER_TELEGRAM_CHAT_ID or TELEGRAM_BOT_TOKEN not set — Telegram newsletter notification disabled.",
    );
    return;
  }
  const text = [
    "📬 Нова підписка на новинки",
    "",
    `Email: ${payload.email}`,
    `Джерело: ${payload.source ?? "footer"}`,
    `Дата: ${payload.subscribedAt.toISOString()}`,
  ].join("\n");

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(
        `[L-TEX] Telegram newsletter notification failed: ${res.status}`,
      );
    }
  } catch (err) {
    console.warn("[L-TEX] Telegram newsletter notification error:", err);
  }
}
```

Зберегти існуючий стиль `notifications.ts` (логи, fetch с timeout, no throw).

### Task 2: Welcome email render + send (no-op fallback)

**Новий файл (якщо немає):** `apps/store/lib/email-newsletter.ts`

Якщо існує спільний `apps/store/lib/email.ts` — додати функцію туди.

```ts
import { getDictionary } from "@/lib/i18n";

export async function sendWelcomeNewsletterEmail(email: string): Promise<void> {
  // No-op якщо email provider не налаштований
  const hasResend = !!process.env.RESEND_API_KEY;
  const hasSmtp =
    !!process.env.SMTP_HOST &&
    !!process.env.SMTP_USER &&
    !!process.env.SMTP_PASS;
  if (!hasResend && !hasSmtp) {
    console.info(
      `[L-TEX] Email provider not configured — welcome newsletter email skipped for ${email}.`,
    );
    return;
  }

  const dict = getDictionary();
  const subject = dict.newsletter.welcomeEmail.subject;
  const body = dict.newsletter.welcomeEmail.body;

  // TODO: інтегрувати з existing email lib (Resend або nodemailer SMTP)
  // Поки existing infrastructure для order emails — пере-юзати її patterns.
  // Якщо є lib/email.ts — використати її send() helper.
  // Інакше — TODO коментар, real send буде у Session 26+ (email provider setup).
  console.info(
    `[L-TEX] Welcome email rendered for ${email} (subject: "${subject}"). TODO: send via real provider.`,
  );
}
```

**Render content (i18n keys):**

```ts
newsletter: {
  // ... existing keys
  welcomeEmail: {
    subject: "Вітаємо на L-TEX! Ви підписані на новинки",
    body: [
      "Доброго дня!",
      "",
      "Дякуємо за підписку на новинки L-TEX. Тепер ви першими дізнаватиметесь про нові надходження, акції та оновлення асортименту.",
      "",
      "Якщо потрібно — звертайтесь:",
      "Телефон: +380 67 671 05 15",
      "Telegram: @L_TEX",
      "",
      "Ваша команда L-TEX",
    ].join("\n"),
  },
},
```

### Task 3: Admin notification mechanism

**Worker:** знайти existing admin notification setup. Найімовірніше це:

- `apps/store/lib/admin-stats.ts` (якщо існує) — повертає dashboard stats з `pendingOrdersCount` etc.
- `apps/store/components/admin/notification-bell.tsx` — UI bell з counter
- `apps/store/app/api/admin/stats/route.ts` — GET endpoint що повертає stats

Додати:

- У `getAdminStats()` (або еквівалент) — нове поле `newSubscribersToday: number` (або `pendingNewsletterSubscribers`).
  - Логіка: count `NewsletterSubscriber` де `subscribedAt >= now() - INTERVAL '1 day'` AND `unsubscribedAt IS NULL`.
- У `notification-bell.tsx` — додати у totalCount або окремий бейдж "Нові підписники: N"
- (Optional) У `admin/page.tsx` dashboard — невелика картка "Підписники за добу: N" з link на (поки не існуючу) `/admin/newsletter` page (або просто текст "управління скоро").

**ВАЖЛИВО:** якщо admin stats endpoint вже використовує `vi.fn()` mocking у tests — додати new field у mock.

### Task 4: Tie it all together у `/api/newsletter/route.ts`

**Файл:** `apps/store/app/api/newsletter/route.ts`

Після успішного INSERT/UPDATE Newsletter:

```ts
const sub = await prisma.newsletterSubscriber.create({...});

// Fire-and-forget notifications (НЕ await — щоб не блокувати response)
void notifyNewsletterSubscribe({
  email: sub.email,
  source: sub.source ?? undefined,
  subscribedAt: sub.subscribedAt,
}).catch((e) =>
  console.error("[L-TEX] notifyNewsletterSubscribe failed:", e),
);

void sendWelcomeNewsletterEmail(sub.email).catch((e) =>
  console.error("[L-TEX] sendWelcomeNewsletterEmail failed:", e),
);

return NextResponse.json({ ok: true }, { status: 201 });
```

Re-subscribe path (`existing.unsubscribedAt`) — також тригерить нотифікації, бо це фактично нова активна підписка.

---

## Tests

### Unit оновити: `apps/store/app/api/newsletter/route.test.ts`

- Mock `notifyNewsletterSubscribe` і `sendWelcomeNewsletterEmail` з `vi.mock()`
- Перевірити що обидва викликаються один раз при success POST
- Перевірити що `notifyNewsletterSubscribe` НЕ кидає 500 якщо Telegram fail (mock fetch reject)
- Перевірити що response 201 повертається навіть якщо notifications fail (через void + catch)

Очікую +3-4 нових тести (218 → ~222).

### Unit новий (optional): `apps/store/lib/notifications.test.ts`

Якщо вже існує — додати test для `notifyNewsletterSubscribe`. Якщо не існує — НЕ створювати окремо.

---

## Verification checklist

- [ ] POST `/api/newsletter` з `{email}` → DB запис + Telegram message (якщо env є) + welcome email (no-op без provider)
- [ ] Re-subscribe (вже відписаний email) → теж тригерить notifications
- [ ] При відсутніх env vars → console.info logs, без 500 для клієнта
- [ ] Admin notification bell показує лічильник нових підписників
- [ ] `pnpm format:check`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm build` — green
- [ ] Test count: 218 → ~222
- [ ] Жоден інший компонент / mobile / packages не зачеплений

---

## Out of scope

- Real email broadcast (потребує email provider) — окрема сесія коли P1 #9 готовий
- Double opt-in confirmation
- Unsubscribe link / page
- Admin newsletter list page (`/admin/newsletter`) — окрема сесія
- Push notification до mobile app — Phase 5 task
- 1С sync для newsletter subscribers — окремо

---

## Commit strategy

**Один atomic commit:**

```
feat(newsletter): notifications on subscribe (admin bell + Telegram + email render)

S23 додала basic newsletter signup. Цей commit активує реакції:
- Telegram message до NEWSLETTER_TELEGRAM_CHAT_ID (env-driven, no-op if unset)
- Welcome email render via i18n; real send no-op until email provider
  configured (P1 #9 — окрема task)
- Admin notification bell counter (last 24h subscribers)

Fire-and-forget pattern: notifications не блокують response 201.
Re-subscribe flow тригерить ті ж notifications (same as new subscribe).

CI: 218 → ~222 tests, format + typecheck + build all green.
```

---

## Push

```bash
git push -u origin claude/session-26-newsletter-notifications
```

Завершити повідомленням orchestrator-у з:

- Branch name (з суфіксом)
- Test count delta
- Чи admin notification bell механізм був знайдений / як інтегровано
- Чи `lib/email.ts` вже існував чи створили новий `email-newsletter.ts`
