# Session 24 — Worker Task: Homepage Cleanup

**Створено orchestrator-ом:** 2026-04-25
**Пріоритет:** P2 (UX simplification per user feedback)
**Очікуваний ефорт:** 20-30 хвилин
**Тип:** worker session (small / атомарний)

---

## Контекст

User проглянув задеплоєний homepage і вирішив: 3 секції (countries carousel, company stats, features bar) — зайві для його B2B клієнтів, заважають фокусу на каталозі. Прибираємо їх повністю — рендер + компоненти + i18n + тести.

Categories grid поки залишити **як є** — окрема Session 25 замінить його на carousel з gradient + lucide icon.

---

## Branch

`claude/session-24-homepage-cleanup` від main.

---

## Hard rules

1. **НЕ ламати CI** — `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm build` мають бути green
2. **НЕ чіпати** `next.config.js`, `apps/store/components/store/banner-carousel.tsx`, `video-reviews-carousel.tsx`, `testimonials-slider.tsx` — ці carousel-и залишаються на homepage
3. **НЕ чіпати** `recently-viewed-section.tsx`, `category` page sections — поза scope
4. **НЕ редагувати** schema.prisma, API routes, mobile app — pure frontend cleanup
5. **Видалити повністю** компоненти, тести й i18n ключі що відносяться до 3 видалених секцій (не залишати dead code)

---

## Що видаляємо

### Секції на homepage (`apps/store/app/(store)/page.tsx`)

1. **Countries carousel** — секція "Прямі постачання з Європи та Канади" з 4 картками (GB / DE / CA / PL)
2. **Company stats block** — секція "L-TEX у цифрах" з 3 counter-animated числами (11+ років / 3000+ клієнтів / 4 країни)
3. **Features bar** — секція з 4 cards: "Від 10 кг" / "4 країни" / "Відеоогляди" / "Швидка доставка"

Всі 3 — окремі `<section>` блоки на homepage. Worker знайде по тексту title-ів та видалить імпорт + JSX render.

---

## Файли для редагування

### 1. `apps/store/app/(store)/page.tsx`

- Прибрати імпорти: `CountriesCarousel`, `CompanyStats` (якщо є)
- Прибрати JSX блоки 3 секцій
- Прибрати features-bar block (4 cards у `dict.home.features` або подібному)

**Зберегти на homepage (НЕ чіпати):**

- BannerCarousel
- Featured products section
- Sale section
- New arrivals section
- **Categories grid** (поки залишається, S25 замінить)
- Video reviews carousel
- Recently viewed section
- Testimonials slider
- CTA

### 2. `apps/store/lib/i18n/uk.ts`

Видалити повністю блоки:

- `countries: { title, subtitle, gb, de, ca, pl, ... }`
- `stats: { title, years, customers, countriesLabel, ... }`
- `home.features: { ... }` (4 features bar) — **тільки якщо існує**, перевірити

Залишити:

- `home.title`, `home.subtitle`, `home.cta.*` тощо — інші homepage ключі
- `testimonials.*`, `newsletter.*` — для інших секцій

### 3. Видалити повністю файли

- `apps/store/components/store/countries-carousel.tsx`
- `apps/store/components/store/countries-carousel.test.tsx`
- `apps/store/components/store/company-stats.tsx`
- `apps/store/lib/use-counter.ts` (використовувався тільки в company-stats)
- `apps/store/lib/use-counter.test.tsx`

---

## Verification checklist

- [ ] Homepage `/` рендериться без помилок (open у dev: `pnpm --filter @ltex/store dev`)
- [ ] **НЕМАЄ** секцій countries / stats / features bar
- [ ] **Є** banner carousel, featured, sale, new, categories grid, videos, recently viewed, testimonials, CTA
- [ ] `pnpm format:check` — PASS
- [ ] `pnpm -r typecheck` — PASS (6/6 packages)
- [ ] `pnpm -r test` — PASS (тести count знизиться на ~3 — 2 з countries-carousel.test, ~3 з use-counter.test = ~5 fewer; 217 → ~212)
- [ ] `pnpm build` — PASS
- [ ] `git status` — тільки очікувані файли (page.tsx + uk.ts змінені; 5 файлів deleted)
- [ ] Жоден файл у `apps/admin`, `services/`, `packages/` не зачепити

---

## Out of scope (НЕ робити)

- Categories carousel (gradient + lucide) — окрема Session 25
- Newsletter notifications — окрема Session 26
- Будь-які інші homepage змінні
- Видалення testimonials-slider або newsletter-form (вони залишаються)
- DB / Prisma / API changes

---

## Commit strategy

**Один atomic commit:**

```
refactor(homepage): remove countries / stats / features-bar sections

User requested removal of 3 sections from homepage to focus on catalog
(per ecosystem chat 2026-04-25):
- Countries carousel ("Прямі постачання з Європи та Канади")
- Company stats ("L-TEX у цифрах" з counter animation)
- Features bar ("Від 10 кг / 4 країни / Відеоогляди / Швидка доставка")

Deleted components + tests + i18n keys (no dead code).
Categories grid kept as-is (Session 25 will replace with carousel).

Files removed:
- countries-carousel.tsx + test
- company-stats.tsx
- use-counter.ts + test (only used by company-stats)
```

---

## Push

```bash
git push -u origin claude/session-24-homepage-cleanup
```

Завершити повідомленням orchestrator-у. Він merge-не у main.
