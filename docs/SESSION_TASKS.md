# L-TEX Ecosystem — Session Tasks Queue

Список активних задач на найближчі worker-сесії, згрупований по пріоритету.

**Дата оновлення:** 2026-04-27
**Поточний стан:** Session 34 complete — mobile HomeScreen banners + 3 product rails live (`/api/mobile/home` endpoint). Регресія deploy.ps1 під PM2 lock — spec у S40. Черга базується на `PROJECT_AUDIT_2026-04-18.md` + marketplace gap analysis + mobile parity backlog.

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

**SMS provider:** SMSClub.mobi (підтверджено user-ом 2026-04-24). Worker додає `lib/sms-client.ts` + env `SMSCLUB_TOKEN`, `SMSCLUB_FROM`. User задає token на сервері перед deploy.

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

**Notification flow:** НЕ Telegram (рішення user-а 2026-04-24). Замість цього — admin notification bell + system ChatMessage у mobile chat для logged-in клієнтів. Email — коли provider налаштований (P1 #9).

### Session 23: Content & Trust Marketing — ✅ DONE (2026-04-25)

Див. `docs/HISTORY.md` → Session 23 Completion Report.
Merged in `cf0580c`. 16 files, 859 insertions, 217 tests passing.
**Server action required:** `pnpm --filter @ltex/db exec prisma migrate deploy` для нової NewsletterSubscriber таблиці.
Follow-up (user-action): real Google reviews текст замість TODO, Blog/articles — окрема велика сесія.

---

## P1 — Mobile parity (Expo client)

Базується на CLAUDE.md "Mobile client" line + `docs/SESSION_38_MOBILE_CATALOG_PARITY.md` follow-up. S38 закрив catalog grid + filter sheet + heart UI; S39 — wishlist persistence + screen.

| #   | Задача                                                                                                  | Тип           | Ефорт     | Статус                                   |
| --- | ------------------------------------------------------------------------------------------------------- | ------------- | --------- | ---------------------------------------- |
| 52  | Wishlist persistence (SecureStore + server mirror) + WishlistScreen list                                | worker        | —         | ✅ DONE (S39)                            |
| 53  | S34 banners + 3 product rails на mobile HomeScreen + `/api/mobile/home`                                 | worker        | —         | ✅ DONE (S34)                            |
| 54  | **S35 chat unread badge** на MoreTab + MoreScreen (polling `/api/mobile/chat/unread`)                   | worker        | —         | ✅ DONE (S35, `efb36f0`)                 |
| 55  | **S36 notifications screen** з backend list + mark read + deep links                                    | worker        | —         | ✅ DONE (S36, `ceeb8b9`) — ⚠️ потребує `prisma migrate deploy` на DBs |
| 56  | S40 deploy.ps1 `pm2 stop` prelude — partial, гіпотеза A хибна (orphan cluster workers)                  | worker        | —         | ⚠️ PARTIAL (S40, see HISTORY)            |
| 56b | S41 fork mode + `pm2 delete` + regex orphan sweep — partial, regex не match-ив PM2 ProcessContainerFork | worker        | —         | ⚠️ PARTIAL (S41, see HISTORY)            |
| 56c | **S42 deploy `pm2 kill` prelude** — daemon-level signal вбиває усіх дітей PM2                           | orchestrator  | —         | ✅ DONE (`b3c9bae`, verified 2x deploys) |
| 57  | QuickView modal (long-press на ProductCard → modal з основною інфою без переходу)                       | worker        | 2-3 год   | PENDING                                  |
| 58  | Pull-on-login wishlist merge (server → local) + conversion з Favorite shape у `WebCatalogProduct`       | worker        | 1-2 год   | PENDING (post-S39)                       |
| 59  | EAS build + Google Play / TestFlight upload (mobile native distribution)                                | user + worker | 1-2 тижні | PENDING (P3 #50, ще не розпочато)        |
| 61  | **S43 DB ViewLog + recommendations engine** + 4-й rail "Рекомендоване для вас" на mobile Home          | worker        | 4-6 год   | NEXT — spec `SESSION_43_*.md`            |
| 62  | **S44 mobile UX fixes batch** — backdrop discard warning + subcategory filter + list mode toggle        | worker        | 1-2 год   | PENDING (post-S43)                       |
| 63  | **S45 QuickView modal mobile** — long-press на ProductCard → modal preview                              | worker        | 2-3 год   | PENDING (post-S44)                       |

**Hard rule для mobile:** не міняти `expo`/`react-native` версій без user-а. Усі pure JS зміни проходять через `pnpm format:check` + ручний QA на Expo Go (worker не може запустити, верифікація — статичні check + spec compliance).

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
| 60  | **Supabase DB decoupling** — задокументувати що Supabase DB = cold backup only (не active mirror), Auth+Storage лишаються. Видалити dual-write код якщо є. Migration `20260428_notifications` НЕ застосовано на Supabase — apply, тільки якщо колись активуємо Netlify fallback. | orchestrator + worker | 1 год |
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
