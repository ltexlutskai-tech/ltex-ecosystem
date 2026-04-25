# L-TEX Ecosystem — Session Tasks Queue

Список активних задач на найближчі worker-сесії, згрупований по пріоритету.

**Дата оновлення:** 2026-04-24
**Поточний стан:** Session 18 complete — сайт LIVE, infrastructure hardened. Черга базується на `PROJECT_AUDIT_2026-04-18.md` + marketplace gap analysis.

---

## P0 — Блокери комерційного запуску

Див. `PROJECT_AUDIT_2026-04-18.md` §6.1 — блок "MUST HAVE". Більшість потребують участі користувача (не worker-session).

| #   | Задача                                                                                         | Тип                 | Ефорт   | Статус               |
| --- | ---------------------------------------------------------------------------------------------- | ------------------- | ------- | -------------------- |
| 1   | Бекапи local PostgreSQL + 14-day retention                                                     | infra               | —       | ✅ DONE (Session 18) |
| 2   | Uptime monitoring (UptimeRobot 3 monitors)                                                     | infra               | —       | ✅ DONE (Session 18) |
| 3   | **Фото продуктів** — Supabase Storage bucket + `scripts/upload-photos.ts` (хоча б топ-100 SKU) | user-action         | 4-8 год | PENDING              |
| 4   | **2-3 банери на homepage** — завантажити через `/admin/banners`                                | user-action         | 30 хв   | PENDING              |
| 5   | **1С sync end-to-end verification** — налаштувати exchange plans + тестове замовлення сайт→1С  | user + 1С-адмін     | 2-4 год | PENDING              |
| 6   | **Production smoke test** — реальне замовлення checkout→email→1С                               | orchestrator + user | 1 год   | PENDING              |

---

## P1 — Важливо (§6.2 аудиту)

| #   | Задача                                                         | Тип           | Ефорт   | Статус  |
| --- | -------------------------------------------------------------- | ------------- | ------- | ------- |
| 7   | Featured products + promo stripe контент                       | user-action   | 30 хв   | PENDING |
| 8   | Umami instance + env vars `NEXT_PUBLIC_UMAMI_*`                | user-action   | 1-2 год | PENDING |
| 9   | Email provider — SMTP (nodemailer) або Resend                  | user-action   | 30 хв   | PENDING |
| 10  | RLS migration — `scripts/enable-rls.sql` у Supabase SQL Editor | user-action   | 5 хв    | PENDING |
| 11  | FTS migration — `scripts/fts-migration.sql` (GIN + pg_trgm)    | user-action   | 5 хв    | PENDING |
| 12  | PM2 log rotation — інакше через місяць диск заповниться        | worker + user | 30 хв   | PENDING |

---

## P2 — Post-deploy security (з Session 17 + 18 deferred)

| #   | Задача                                                                                           | Тип           | Ефорт   |
| --- | ------------------------------------------------------------------------------------------------ | ------------- | ------- |
| 13  | **CSP hardening** — прибрати `unsafe-inline`/`unsafe-eval` через nonce middleware                | worker        | 2-3 год |
| 14  | **Mobile SSE token** — винести з query param (коли mobile app буде deploy-нутий)                 | worker        | 1 год   |
| 15  | **X-Forwarded-For trust** — Caddy/cloudflared config + `x-real-ip` пріоритет у `rate-limit.ts`   | worker + user | 30 хв   |
| 16  | **Telegram webhook secret startup validation** (аналог MOBILE_JWT_SECRET в `instrumentation.ts`) | worker        | 15 хв   |
| 17  | **Console logging audit** — знайти `console.error(\`...${}\`)` на PII leak                       | worker        | 30 хв   |

---

## P2 — Marketplace UX (gap analysis vs Kasta/Rozetka/Optom.com.ua)

Базується на research B2B e-commerce best practices 2026 + inventory поточного стану. Див. notes in chat 2026-04-24.

### Session 20: B2B UX Essentials — ✅ DONE (2026-04-24)

Див. `docs/HISTORY.md` → Session 20 Completion Report.
Merged in `84f8d64`. 18 files, 880 insertions, 228 tests passing.
Follow-up (user-action): заповнити real content Terms/Privacy/Returns, замінити social handles на реальні.

### Session 21: Customer Auth + Quick Registration (~6-8 год, worker)

**Spec:** `docs/SESSION_21_CUSTOMER_AUTH.md`
**Auth flow (рішення A1):** phone + OTP (Telegram bot як primary delivery, mock fallback; SMS provider — окрема сесія)
**Реєстрація (рішення B):** швидка форма (ім'я, телефон, область, місто) → запис у Customer → 1С sync щоб менеджер дозаповнив у своїй карті клієнта.

| #   | Задача                                                         |
| --- | -------------------------------------------------------------- |
| 24  | DB: extend Customer + new OtpCode model                        |
| 25  | OTP generation + Telegram bot delivery + mock fallback         |
| 26  | API routes (request-otp, verify-otp, register, logout, me)     |
| 27  | `/login` + `/register` pages з 2-step OTP flow                 |
| 28  | `/account/*` dashboard + middleware auth guard                 |
| 29  | Quick reorder з order history                                  |
| 30  | `/api/sync/customers` для 1С (web-self-register → 1С менеджер) |

**BLOCKER:** SMS provider — поки використовуємо Telegram OTP + mock; SMS-fly додається окремо.

### Session 22: Quote Request System (~4-5 год, worker)

**Spec:** `docs/SESSION_22_QUOTE_REQUEST.md`
**Бізнес-рішення:** volume discount UI (C3) — НЕ робимо, тільки через менеджера. Quote Request (D1) — ТАК. CSV upload (E) — НЕ робимо.

| #   | Задача                                                               |
| --- | -------------------------------------------------------------------- |
| 31  | DB: new Quote model + QuoteStatus enum                               |
| 32  | `/api/quote` POST з Zod + rate limit + Telegram notify до менеджера  |
| 33  | `/quote` page form + CTA links з homepage / catalog / product        |
| 34  | `/admin/quotes` management page (filter, respond, status workflow)   |
| 35  | Stock indicator на ProductCard (out-of-stock / last lot / low stock) |
| 36  | `docs/SYNC_QUOTES_1C.md` — документація sync API (без реалізації)    |

**BLOCKER:** Telegram chat_id для quote notification — потрібно env `QUOTE_NOTIFICATION_TELEGRAM_CHAT_ID`.

### Session 23: Content & Trust Marketing (~4-5 год, worker + user content)

**Spec:** `docs/SESSION_23_TRUST_CONTENT.md`

| #   | Задача                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------- |
| 37  | Замінити placeholder social handles на 7 реальних URL (Telegram×2, Viber, Instagram, Facebook, TikTok, YouTube) |
| 38  | Countries carousel на homepage (England/Germany/Canada/Poland)                                                  |
| 39  | Company stats block ("11+ років, 500+ клієнтів, 4 країни") з counter animation                                  |
| 40  | Testimonials slider (5 hardcoded з Google reviews + link на review page)                                        |
| 41  | Newsletter signup у footer + DB модель NewsletterSubscriber                                                     |
| 42  | Blog / articles (deferred — окрема велика сесія, потребує content strategy)                                     |

**BLOCKER:** число "500+ клієнтів" — потрібно реальне число від user-а (або зробити "Сотні клієнтів").
**BLOCKER:** 5 топ-Google-відгуків — placeholder спочатку, реальні testimonials user додасть post-deploy.

---

## P3 — Tech debt (§8.1 аудиту)

| #   | Задача                                                                   | Тип                 | Ефорт |
| --- | ------------------------------------------------------------------------ | ------------------- | ----- |
| 37  | E2E `continue-on-error: true` → `false` (gate merge)                     | orchestrator        | 5 хв  |
| 38  | GitHub Protected Branches на `main`                                      | user + orchestrator | 10 хв |
| 39  | Nodemailer retry/DLQ — зараз 10с timeout і втрата email                  | worker              | 1 год |
| 40  | `revalidatePath("/")` cleanup — знайти надмірні invalidations            | worker              | 1 год |
| 41  | Dependabot / Renovate config                                             | worker              | 30 хв |
| 42  | `npm audit` + license check у CI                                         | worker              | 30 хв |
| 43  | Bundle size baseline — `ANALYZE=true pnpm build` snapshot                | worker              | 20 хв |
| 44  | Видалити deprecated `netlify.toml` + `outputFileTracingIncludes` залишки | worker              | 10 хв |

---

## P3 — Process / docs

| #   | Задача                                                                    | Тип                 | Статус                           |
| --- | ------------------------------------------------------------------------- | ------------------- | -------------------------------- |
| 45  | Розбити CLAUDE.md на ARCHITECTURE / HISTORY / CONVENTIONS / SESSION_TASKS | worker              | ✅ DONE (Session 19, 2026-04-24) |
| 46  | Runbook `docs/RUNBOOK.md` — що робити якщо Caddy/PM2/cloudflared падає    | orchestrator + user | PENDING                          |
| 47  | Staging environment (VM або docker compose)                               | user + worker       | 1 день                           |

---

## Стратегічні (не зроблено, §6.4 аудиту)

| #   | Задача                                                  | Рішення                                                    | Ефорт       |
| --- | ------------------------------------------------------- | ---------------------------------------------------------- | ----------- |
| 48  | Mobile Agent App (польові продавці)                     | потребує скріншотів MobileAgentLTEX v1.15.3 + окрема сесія | багатоденна |
| 49  | Warehouse App                                           | не розпочинали                                             | багатоденна |
| 50  | Mobile client EAS build + TestFlight / Google Play      | user + worker (Expo EAS)                                   | 1-2 тижні   |
| 51  | Multi-language (EN, PL) — інфра готова, переклади немає | user + worker                                              | 1-2 дні     |

---

## Відкриті бізнес-питання (§12 аудиту)

Ці питання потребують рішення user-а перед відповідними worker-сесіями.

**Для контенту (P0/P1):**

- Чи є архів фото для 805 SKU? Якщо ні — фотосесія vs placeholder-и?
- Чи AI-банери вже згенеровані?
- Хто курує featured products — вручну чи auto-by-orders?
- Який текст promo stripe?
- Email: SMTP vs Resend?
- Umami: self-host vs umami.is cloud ($9/міс)?

**Для операцій:**

- Хто 1С-адмін для налаштування exchange plans?
- Хто моніторить UptimeRobot alerts?
- Off-site backup — куди (S3? rclone? OneDrive?)?
- Netlify вимикати зараз чи тримати fallback?
- Supabase після міграції — тільки Auth+Storage чи і DB?

**Для marketplace sessions:**

- Customer auth flow — phone + OTP (mobile-like) чи phone + password? Чи email?
- Volume discount policy — чи L-TEX дає знижки на більшу кількість кг?
- Quote request — має сенс для L-TEX (чи вистачає стандартних лотів)?
- Customer reviews / ratings — додавати?

**Стратегічні:**

- Mobile Agent App пріоритет на Q2 2026?
- Online payments переглянути чи permanent "ні"?
- Blog/content marketing пріоритет?

---

## Worker-spec templates

Коли orchestrator готовий запустити worker-сесію з таблиці вище — створює окремий файл `docs/SESSION_N_<NAME>.md` з детальною специфікацією (файли, кроки, verification, commit strategy, out-of-scope).

Приклад існуючого template: `docs/SESSION_19_DECOMPOSITION.md`.
