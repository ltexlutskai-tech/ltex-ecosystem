# Session 20 — Worker Task: B2B UX Essentials

**Створено orchestrator-ом:** 2026-04-24
**Пріоритет:** P2 (marketplace UX improvements)
**Очікуваний ефорт:** 4-6 годин
**Тип:** worker session (пише код, пушить feature branch, orchestrator мерджить)

---

## Контекст

Сайт LIVE, має базовий e-commerce функціонал, але не досягає marketplace-стандартів. Gap analysis проти Kasta / Rozetka / Optom.com.ua (див. `PROJECT_AUDIT_2026-04-18.md` + chat notes 2026-04-24) показав 6 швидких UX wins для B2B:

1. Compare checkboxes у каталозі (компонент існує, треба підключити до grid)
2. Filter subcategory + in-stock toggle у catalog
3. Share buttons на product page (copy link, Viber, Telegram, FB)
4. Окремі Terms / Privacy / Returns сторінки (trust + SEO)
5. Social icons у footer (зараз тільки Telegram)
6. Delivery info block на product page (не тільки FAQ)

Всі 6 задач — чиста frontend робота, без DB/API змін. Low risk.

---

## Branch

Створити `claude/session-20-b2b-ux-essentials` від main.

---

## Hard rules (no exceptions)

1. **НЕ ламати CI** — після змін `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm build` мають бути green
2. **НЕ чіпати** `apps/store/next.config.js` — critical для standalone build
3. **НЕ додавати** нові dependencies якщо без них можна обійтись (іконки беремо з `lucide-react` який вже є)
4. **НЕ чіпати** DB schema / Prisma / API routes — це frontend-only task
5. **НЕ додавати** online payment UI / auth / account pages — це окремі сесії
6. **НЕ писати** оригінальний текст Terms/Privacy/Returns — використовувати placeholder з TODO коментарем для user review
7. **Зберігати** існуючу i18n-дисципліну — нові strings у `apps/store/lib/i18n/uk.ts`, не hard-coded
8. **Тести обов'язкові** для нових компонентів (мінімум для `share-buttons.tsx` і filter logic)

---

## Task 1: Compare checkboxes на ProductCard

**Файли:**

- `apps/store/components/store/product-card.tsx` — додати checkbox у кут картки
- `apps/store/lib/comparison.tsx` — вже існує з `useComparison()` hook (add/remove/has)

**Реалізація:**

1. Імпортувати `useComparison()` у `product-card.tsx`
2. Додати невеликий checkbox (Checkbox з shadcn/ui) у верхній правий кут (поряд з heart/wishlist)
3. Checkbox checked якщо `has(product.id)`, onClick toggle через `toggle(product)`
4. Показати бейдж лічильника на `ComparisonButton` у header (якщо ще немає)
5. Мінімум 2 products для порівняння, максимум 3 (існуючий constraint)

**Очікуваний результат:** користувач ставить галочки на 2-3 товарах у каталозі, переходить у `/compare`, бачить їх.

**Тест:**

- Unit: оновити `apps/store/lib/comparison.test.tsx` — перевірити що toggle додає і видаляє
- E2E (optional, якщо є час): додати клік-сценарій у `e2e/catalog.spec.ts`

---

## Task 2: Subcategory filter + in-stock toggle

**Файли:**

- `apps/store/components/store/catalog-filters.tsx` — додати 2 нових контроли
- `apps/store/app/(store)/catalog/page.tsx` — читати новий searchParam, передавати у `getCatalogProducts`
- `apps/store/app/(store)/catalog/[categorySlug]/page.tsx` — підвантажити subcategories для вибраної категорії
- `apps/store/lib/catalog.ts` — додати `subcategorySlug?: string` і `inStockOnly?: boolean` параметри

**Реалізація:**

1. **Subcategory filter:**
   - У `/catalog/[categorySlug]` сторінці — `<select>` (або radio group) з переліком subcategory children для цієї категорії
   - query param `?sub=<slug>`, default "все"
   - У filter функції — `AND categoryId IN (category.children.id + category.id)` або точно `categorySlug` коли selected

2. **In-stock toggle:**
   - `<Checkbox label="Тільки в наявності">` у фільтрах
   - query param `?inStock=true`
   - логіка: `WHERE lots.some(status IN ('free', 'on_sale'))` — товар показується, якщо є хоча б один доступний лот

**i18n ключі нові у `uk.ts`:**

```ts
catalogFilters: {
  subcategory: "Підкатегорія",
  subcategoryAll: "Всі підкатегорії",
  inStockOnly: "Тільки в наявності",
}
```

**Тести:**

- Unit: оновити `apps/store/lib/catalog.test.ts` — add fixture tests для `subcategorySlug` і `inStockOnly`

---

## Task 3: Share buttons на product page

**Новий файл:** `apps/store/components/store/share-buttons.tsx`

**Реалізація:**

1. Client component з props `{ url: string; title: string }`
2. 4 кнопки inline (icon + label):
   - **Copy link** — `navigator.clipboard.writeText(url)`, показати toast "Посилання скопійовано"
   - **Viber** — відкрити `viber://forward?text=${encoded title + url}`
   - **Telegram** — `https://t.me/share/url?url=${url}&text=${title}`
   - **Facebook** — `https://www.facebook.com/sharer/sharer.php?u=${url}`
3. Icons — `Link2`, `MessageCircle` (Telegram placeholder), `Facebook` з lucide-react. Для Viber — custom inline SVG або lucide `Phone`
4. Responsive — на mobile compact icons-only, на desktop з labels

**Інтеграція:**

- `apps/store/app/(store)/product/[slug]/page.tsx` — імпортувати і рендерити нижче image gallery або у title area
- URL формувати як `${SITE_URL}/product/${product.slug}`

**Тести:**

- Unit новий: `apps/store/components/store/share-buttons.test.tsx` — basic render + click copy

**i18n ключі:**

```ts
share: {
  title: "Поділитись",
  copyLink: "Скопіювати посилання",
  copyLinkToast: "Посилання скопійовано",
  viber: "Viber",
  telegram: "Telegram",
  facebook: "Facebook",
}
```

---

## Task 4: Terms / Privacy / Returns pages

**Нові файли:**

- `apps/store/app/(store)/terms/page.tsx` — Умови використання
- `apps/store/app/(store)/privacy/page.tsx` — Політика конфіденційності
- `apps/store/app/(store)/returns/page.tsx` — Повернення та обмін

**Шаблон для кожної:**

```tsx
import { Metadata } from "next";
import { dict } from "@/lib/i18n";

export const metadata: Metadata = {
  title: dict.terms.metaTitle + " | " + APP_NAME,
  description: dict.terms.metaDescription,
  alternates: { canonical: `${SITE_URL}/terms` },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <main className="container mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-6">{dict.terms.title}</h1>
      <div className="prose prose-slate max-w-none">
        {/* TODO(L-TEX legal): замінити на реальний текст погоджений юристом */}
        <p>{dict.terms.placeholder}</p>

        <h2>1. Загальні положення</h2>
        <p>TODO: описати ...</p>

        {/* решта секцій як placeholder */}
      </div>
    </main>
  );
}
```

**Placeholder-контент для кожної сторінки:**

- **Terms (Умови використання):** placeholder з TODO секціями: Загальні положення, Реєстрація, Замовлення, Доставка, Відповідальність, Зміни умов, Контакти.
- **Privacy (Політика конфіденційності):** TODO: Які дані збираємо (ім'я, телефон, адреса), Для чого, Зберігання, Кому передаємо (Нова Пошта, Telegram), Права користувача, Cookies, Контакти DPO.
- **Returns (Повернення та обмін):** TODO: Умови повернення оптових лотів, Строки (14 днів / не повертається як секонд-хенд — ухвалити), Процедура, Контакт для повернень, Винятки.

**Footer:** додати посилання на 3 нові сторінки у секцію "Інформація" (або новий блок).

**i18n ключі:**

```ts
terms: {
  metaTitle: "Умови використання",
  metaDescription: "Умови використання сайту L-TEX",
  title: "Умови використання",
  placeholder: "Цей текст — чернетка. Погоджуйте з юристом перед публікацією.",
},
privacy: { ... },
returns: { ... },
```

---

## Task 5: Social icons у footer

**Файл:** `apps/store/components/footer.tsx`

**Реалізація:**

1. Додати блок "Соцмережі" (або розширити існуючий) з 4 іконками:
   - Telegram — вже є
   - Facebook — placeholder `https://facebook.com/ltex` (TODO коментар: замінити на реальний handle)
   - Instagram — placeholder `https://instagram.com/ltex` (TODO)
   - YouTube — placeholder `https://youtube.com/@ltex` (TODO)
2. Icons з lucide-react: `Send` (Telegram alternative), `Facebook`, `Instagram`, `Youtube`
3. Всі `<a target="_blank" rel="noopener noreferrer">`
4. aria-label для кожного
5. TODO коментар над секцією: "Замінити на реальні handles коли створимо акаунти"

---

## Task 6: Delivery info block на product page

**Файл:** `apps/store/app/(store)/product/[slug]/page.tsx`

**Реалізація:**

Додати новий блок після ціни / lots table, перед "similar products":

```tsx
<section className="mt-8 rounded-lg border bg-muted/30 p-6">
  <h3 className="mb-4 text-xl font-semibold">{dict.delivery.title}</h3>
  <ul className="space-y-2 text-sm">
    <li>📦 {dict.delivery.novaPoshta}</li>
    <li>🚛 {dict.delivery.ownDelivery}</li>
    <li>⏱️ {dict.delivery.leadTime}</li>
    <li>💰 {dict.delivery.minimumOrder}</li>
  </ul>
</section>
```

**i18n ключі:**

```ts
delivery: {
  title: "Доставка та оплата",
  novaPoshta: "Нова Пошта по всій Україні — 1-3 робочих дні",
  ownDelivery: "Власна доставка по Волинській області",
  leadTime: "Відправка у день замовлення або наступного дня",
  minimumOrder: "Мінімальне замовлення — від 10 кг",
}
```

**Без emoji** якщо user не дозволяє — тоді використовуємо `lucide-react` іконки (Package, Truck, Clock, Scale).

---

## Verification checklist (перед push)

- [ ] Compare checkboxes з'являються у grid каталогу, toggle працює, `/compare` показує вибрані
- [ ] Subcategory filter і in-stock toggle рендеряться, URL params змінюють результат
- [ ] `/product/<slug>` показує 4 share кнопки (copy, Viber, Telegram, Facebook); "Copy link" кладе URL у clipboard і показує toast
- [ ] `/terms`, `/privacy`, `/returns` відкриваються (200), мають metadata, лінки з footer працюють
- [ ] Footer має 4 social icons з aria-label
- [ ] Delivery block на product page видимий, i18n-ключі підтягуються
- [ ] `pnpm format:check` — PASS
- [ ] `pnpm -r typecheck` — PASS (6/6 packages)
- [ ] `pnpm -r test` — PASS (220+ unit, бажано 225+ після нових тестів)
- [ ] `pnpm build` — PASS

---

## Out of scope (НЕ робити)

- Реальний юридичний текст Terms/Privacy/Returns — тільки placeholder з TODO
- Customer account / signup / login — Session 21
- Quote request / bulk CSV upload — Session 22
- Newsletter / testimonials / brands carousel — Session 23
- DB schema змін
- Нові API routes (крім якщо абсолютно необхідно)
- Backend тестування
- Mobile app changes
- Admin panel changes
- CSP nonce / security changes
- Ліцензування / payment integration

---

## Commit strategy

Розбити на 6 комітів (по одному на Task), або 3 коміти:

1. `feat(catalog): compare checkboxes + subcategory + in-stock filters` (Task 1-2)
2. `feat(product): share buttons + delivery info block` (Task 3, 6)
3. `feat(legal): Terms/Privacy/Returns pages + footer social icons` (Task 4-5)

Все в одному PR (одна feature branch), orchestrator merge-squash або --no-ff merge.

---

## Push

```bash
git push -u origin claude/session-20-b2b-ux-essentials
```

Потім повідомити orchestrator — він зробить review + merge у main.

---

## Очікуваний результат

- Сайт виглядає ближче до marketplace-стандарту (Kasta/Rozetka рівень)
- B2B клієнти можуть: порівняти товари з каталогу, поділитись посиланням у Viber/Telegram, бачать delivery info одразу на сторінці товару, мають legal pages
- SEO покращено: +3 індексовані сторінки (Terms/Privacy/Returns), структурований social signal через footer links
- Trust signals: legal pages = ознака серйозного бізнесу для нових клієнтів
