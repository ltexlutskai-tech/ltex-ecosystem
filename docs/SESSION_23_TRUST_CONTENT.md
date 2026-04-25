# Session 23 — Worker Task: Content & Trust Marketing

**Створено orchestrator-ом:** 2026-04-24
**Пріоритет:** P2 (marketing / trust signals)
**Очікуваний ефорт:** 4-5 годин
**Тип:** worker session

---

## Контекст

Session 20 додала legal pages + footer social icons з placeholder URL. Session 23 закриває контентний gap для marketplace credibility:

1. **Замінити placeholder soc-handles** на реальні (7 каналів L-TEX)
2. **Brands / countries carousel** — підкреслити походження товарів (England, Germany, Canada, Poland)
3. **Company stats block** — Років на ринку, Клієнтів, Країн (без "кг/рік")
4. **Customer testimonials slider** — топ-5 відгуків з Google (manual hardcode + посилання на Google reviews)
5. **Newsletter signup у footer** — простий form з email storage у DB

---

## Branch

`claude/session-23-trust-content` від main.

---

## Hard rules

1. **НЕ ламати CI** — повний pipeline green
2. **НЕ writіти оригінальний marketing copy** — використати фрази з existing CLAUDE.md / about page
3. **Customer testimonials — manual hardcode** з Google reviews, не Google Places API integration (надмірне ускладнення для MVP)
4. **Newsletter без email provider** — зберігати у DB, реальна розсилка — окрема сесія
5. **Тести** — мінімум для newsletter API + brand carousel render

---

## Task 1: Replace social handles у footer

**Файл:** `apps/store/components/footer.tsx` + `apps/store/components/store/social-icons.tsx`

Замінити placeholder URLs на реальні (надав user 2026-04-24):

| Канал                     | URL                                               |
| ------------------------- | ------------------------------------------------- |
| Telegram (Second + Stock) | `https://t.me/LTEX_Second`                        |
| Telegram (Bric-a-Brac)    | `https://t.me/LTEX_Bric`                          |
| Viber group               | `https://bit.ly/4ahemp4`                          |
| Instagram                 | `https://instagram.com/ltex_secondopt`            |
| Facebook group            | `https://www.facebook.com/groups/984605345078238` |
| TikTok                    | `https://www.tiktok.com/@ltex.second.opt`         |
| YouTube                   | `https://youtube.com/@l-tex_second_stok`          |

**UX:** показати все 7 у footer (рядок з icons). Можливо додати labels: "Telegram", "Bric-a-Brac" (для двох TG каналів — щоб не плутали).

Додати **TikTok icon** + **Viber icon** в `social-icons.tsx` (поточний має тільки FB inline SVG + lucide-Send для Telegram).

Видалити TODO коментарі про "замінити на real handles".

**Update sitemap** — НЕ потрібно, ці посилання external.

---

## Task 2: Brands / Countries carousel на homepage

**Новий компонент:** `apps/store/components/store/countries-carousel.tsx`

Показати 4 країни-постачальники (England, Germany, Canada, Poland) з прапорами + текстом "Прямі постачання з Європи".

**Static data:**

```ts
const SUPPLIER_COUNTRIES = [
  { code: "GB", name: "Англія", flag: "🇬🇧", description: "Якісний оригінал" },
  {
    code: "DE",
    name: "Німеччина",
    flag: "🇩🇪",
    description: "Європейські бренди",
  },
  { code: "CA", name: "Канада", flag: "🇨🇦", description: "Перевірена якість" },
  { code: "PL", name: "Польща", flag: "🇵🇱", description: "Швидка логістика" },
];
```

**Render:** 4-колонкова grid (1 колонка на mobile) з картками. Кожна картка — flag + name + description.

**Розміщення на homepage:** після categories grid, перед video reviews.

**Без emoji** якщо preference user-а — використати inline SVG прапорів (4 файли у `public/flags/`) або lucide-react Globe з підписами.

**i18n keys:** countries.title, countries.subtitle, countries.gb, countries.de, countries.ca, countries.pl.

---

## Task 3: Company stats block

**Новий компонент:** `apps/store/components/store/company-stats.tsx`

3 статистики на homepage (під hero або у Features section):

```ts
const STATS = [
  { value: 11, suffix: "+ років", label: "на ринку (з 2015)" },
  { value: 3000, suffix: "+", label: "постійних клієнтів" },
  { value: 4, suffix: "", label: "країни-постачальники" },
];
```

**Підтверджено user-ом 2026-04-24:** "3000+ постійних клієнтів". Counter animation 0 → 3000 за 1.5s виглядатиме впечатляюче.

**Animation:** кожне число анімується від 0 до final value за 1.5s при scroll into view (використати Intersection Observer + simple counter hook). Без додаткових deps.

**Розміщення:** на homepage між hero і categories, або після countries carousel.

**Тест:** unit для counter hook (3 tests).

---

## Task 4: Customer testimonials slider

**Новий компонент:** `apps/store/components/store/testimonials-slider.tsx`

**Static data:** 5 топ-відгуків з Google reviews (https://share.google/agHbowjiDBGRAdue6).

**ВАЖЛИВО для worker-а:** **НЕ парсити Google reviews API**. Замість цього:

- Створити `apps/store/lib/testimonials.ts` з 5 hardcoded testimonials
- Кожен testimonial: `{ name, rating: 1-5, date, text, source: 'google' | 'instagram' | 'manual' }`
- Текст testimonials — TODO з пометкою "User: скопіюй 5 топ-відгуків з Google reviews після deploy" (placeholder з Lorem-ish content "Замовляли вже не вперше, якість на висоті...")

**Render:** carousel (auto-rotate 6s), 1 testimonial per slide, з:

- Зірками рейтингу
- Текстом відгуку (truncated до 200 chars)
- Іменем + датою + source badge
- Внизу slider — лінк "Всі відгуки на Google" → https://share.google/agHbowjiDBGRAdue6

**Розміщення:** на homepage перед CTA section.

**i18n keys:** testimonials.title, testimonials.allReviews.

---

## Task 5: Newsletter signup у footer

**Новий файл:** `apps/store/app/api/newsletter/route.ts` — POST endpoint

**DB schema:**

```prisma
model NewsletterSubscriber {
  id          String   @id @default(uuid())
  email       String   @unique
  phone       String?  // optional, для Telegram broadcast
  subscribedAt DateTime @default(now())
  unsubscribedAt DateTime?
  source       String?  // "footer" | "checkout" | "manual"
  // GDPR-light: дата confirm — для подальшої double opt-in implementation
  confirmedAt  DateTime?
}
```

Migration: `pnpm db:migrate -- --name add-newsletter-subscriber`.

**API:**

- POST { email } → 201 (Created) або 200 (already subscribed)
- Rate limit: 5/IP/hour
- Zod validate email format
- Save до DB, response toast у UI

**Footer форма:** простий input + button "Підписатись" у footer колонці. Розширити existing layout без зайвої перебудови.

**Backend сповіщення:** ні — наразі просто зберігаємо. Реальна розсилка — окрема сесія коли email provider буде налаштований (P1 #9).

**Admin page (optional, якщо буде час):** `/admin/newsletter` — простий list subscribers з export CSV.

**i18n keys:** newsletter.title, newsletter.placeholder, newsletter.cta, newsletter.success, newsletter.error.

**Тести:** API route — 5 tests (success, dup email = 200, rate limit, invalid email, etc).

---

## Task 6 (optional, якщо буде час): Press / Reviews mention

Створити невелику секцію "Про нас пишуть" якщо у user-а є media mentions. Якщо немає — пропустити.

---

## Verification checklist

- [ ] Footer має 7 social icons з real URLs (no placeholder)
- [ ] `/` показує countries carousel + stats block + testimonials slider
- [ ] Counter animation тригериться при scroll into view
- [ ] Newsletter form у footer працює, email зберігається у DB
- [ ] DB migration applies cleanly
- [ ] CI green

---

## Out of scope

- Google Places API integration (manual hardcode тільки)
- Email broadcast / campaign setup
- Double opt-in confirm email
- Unsubscribe link / page
- Blog / articles — окрема велика сесія (потребує content strategy from user)
- Press kit / Brand assets
- Loyalty program
- Referral program

---

## Commit strategy

3 коміти:

1. `feat(content): countries carousel + company stats block on homepage`
2. `feat(content): testimonials slider + newsletter form in footer`
3. `feat(content): replace placeholder social handles with real URLs`

---

## Push

```bash
git push -u origin claude/session-23-trust-content
```
