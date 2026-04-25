# Session 22 — Worker Task: Quote Request System

**Створено orchestrator-ом:** 2026-04-24
**Пріоритет:** P2 (B2B-specific feature)
**Очікуваний ефорт:** 4-5 годин
**Тип:** worker session

---

## Контекст

Бізнес-рішення (підтверджено user-ом 2026-04-24):

- **Volume discount UI на сайті — НЕ робити** (рішення C3): знижки за обсяг тільки через менеджера, не публічні ціни
- **Quote Request — ТАК** (рішення D1): клієнт вказує орієнтовну кількість + категорію + коментар → менеджер пропонує ціну
- **CSV bulk upload — НЕ робити** (рішення E): всі заповнюють вручну через каталог
- **Stock indicator на product card — ТАК** (рішення продовжене): показ "В наявності X лотів" або "Закінчується"

Тобто з first scope Session 22 (4 tasks) залишилось 2: Quote Request + Stock indicator. Нижче — детальний spec.

---

## Branch

`claude/session-22-quote-request` від main.

**Залежність:** не блокується Session 21, але якщо S21 merged — quote form пре-філлить дані з logged-in customer-а.

---

## Hard rules

1. **НЕ ламати CI** — повний pipeline green
2. **НЕ дозволяти спам** — rate limit 3 quote requests / IP / годину
3. **Notification до менеджера** — Telegram chat (потребує chat_id, див. Open questions)
4. **НЕ зберігати ціни на frontend** — тільки category + estimatedQuantity + notes
5. **Quote create НЕ замовлення** — окрема таблиця `Quote`, не `Order`
6. **Тести обов'язкові** — Zod validation, rate limit, 1С sync

---

## Open questions (BLOCK — питати orchestrator)

1. **Куди надсилати notifications quote-request-ів?**
   - Telegram chat ID — який саме? (manager personal chat? group chat?)
   - Email — до якого менеджера / групи?
   - 1С — створювати запис у "Лідах" одразу?
   - **Рекомендація:** додати у env `QUOTE_NOTIFICATION_TELEGRAM_CHAT_ID` — user задасть значення.

2. **Status workflow для quote:**
   - `pending` (created) → `quoted` (manager replied with price) → `accepted` (customer ok) → `converted_to_order`
   - Чи `rejected` / `expired`?

3. **TTL quote:** як довго quote дійсний? 7 днів? 30 днів?

---

## Task 1: DB schema — Quote model

**Файл:** `packages/db/prisma/schema.prisma`

```prisma
model Quote {
  id                String       @id @default(uuid())
  customerId        String?      // FK to Customer (если logged-in); null если guest
  customer          Customer?    @relation(fields: [customerId], references: [id])

  // Customer details (snapshot, для guest або зміни)
  contactName       String
  contactPhone      String
  contactRegion     String?
  contactCity       String?

  // Request details
  estimatedQtyKg    Decimal      // орієнтовна кількість у кг
  categoryId        String?      // FK to Category
  category          Category?    @relation(fields: [categoryId], references: [id])
  qualityPreferred  String?      // optional: Екстра / Крем / 1й / 2й / Сток / Мікс
  notes             String?      @db.Text

  // Manager response
  status            QuoteStatus  @default(pending)
  proposedPriceEur  Decimal?     // ціна, яку запропонував менеджер
  managerNotes      String?      @db.Text
  respondedAt       DateTime?
  respondedBy       String?      // admin user email

  // Audit
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt
  ipAddress         String?      // for rate limit / abuse
  source            String       @default("web") // "web" | "telegram" | "viber"
  syncedTo1cAt      DateTime?

  @@index([status, createdAt])
  @@index([contactPhone])
}

enum QuoteStatus {
  pending
  quoted
  accepted
  rejected
  expired
}
```

Migration: `pnpm db:migrate -- --name add-quote-model`.

---

## Task 2: API route + Zod validation

**Новий файл:** `apps/store/app/api/quote/route.ts`

```ts
POST { name, phone, region?, city?, estimatedQtyKg, categoryId?, qualityPreferred?, notes? }
→ 201 { quoteId }
→ 429 if rate limited
→ 400 Zod error
```

Steps:

1. Zod parse (mirror Quote schema)
2. Rate limit (3/IP/hour)
3. Phone normalize via `lib/phone.ts`
4. Якщо logged-in (cookie) — set customerId
5. INSERT Quote
6. Trigger Telegram notification до менеджера через `lib/notifications.ts` (extend з `notifyManagerQuote(quote)`)
7. Return quoteId

**Тести:** `apps/store/lib/__tests__/quote-route.test.ts` — 8 tests (success, rate limit, validation errors, normalization, notification call, customer-bound vs guest).

---

## Task 3: Quote request page

**Новий файл:** `apps/store/app/(store)/quote/page.tsx`

**Form:**

- Ім'я \*
- Телефон \*
- Область, Місто (optional)
- **Orientовна кількість (кг)** \* — number input, min 10
- **Категорія** (`<select>` з 7 categories — з DB) — optional
- **Бажана якість** (`<select>` з 6 quality levels) — optional
- **Коментар** (textarea, до 500 chars) — optional
- Submit → POST /api/quote → success page з message "Менеджер зв'яжеться з вами протягом 24 годин"

**UX details:**

- Якщо logged-in (Session 21) — pre-fill name/phone/region/city з customer
- Show "Мінімальна кількість 10 кг" hint
- Toast on success
- Disable submit поки в process

**Linker:** додати CTA "Не знайшли потрібного? Залишіть запит" на:

- Homepage (під categories grid)
- Catalog page (хедер або footer)
- Product page (під price якщо ціни немає або lots закінчуються)

**i18n keys у `uk.ts`:** quote.title, quote.subtitle, quote.fields._, quote.cta._, quote.success.\*

---

## Task 4: Admin Quote management

**Новий файл:** `apps/store/app/admin/quotes/page.tsx`

Admin table з:

- Columns: Created, Customer, Phone, Qty (kg), Category, Quality, Status, Actions
- Filter by status (pending / quoted / etc)
- Sort by createdAt
- Click row → expand-row з повним notes + form для відповіді:
  - Proposed price EUR
  - Manager notes
  - Save → status `quoted`, send Telegram/Viber notification до клієнта

Server actions у `apps/store/app/admin/quotes/actions.ts`:

- `respondToQuote(quoteId, priceEur, notes)`
- `markAsAccepted(quoteId)` / `markAsRejected(quoteId)` / `convertToOrder(quoteId)`

Auth: `requireAdmin()` (existing helper).

---

## Task 5: Stock indicator on product card

**Файл:** `apps/store/components/store/product-card.tsx` + `apps/store/lib/catalog.ts`

**Реалізація:**

1. У `getCatalogProducts()` додати computed field `availableLotsCount` (count(lots WHERE status IN free, on_sale))
2. У `ProductCard`:
   - Якщо `availableLotsCount === 0` → бейдж "Немає в наявності" (grey) + button disabled
   - Якщо `availableLotsCount === 1` → бейдж "Останній лот" (red, urgency)
   - Якщо `availableLotsCount <= 3` → бейдж "Закінчується" (orange)
   - Якщо `availableLotsCount > 3` → "В наявності X лотів" (subtle)

**i18n keys:** product.stockIndicator.outOfStock, lastLot, lowStock, available

**Тести:** unit для catalog.ts (already covered by Session 20 inStockOnly param) + render test для ProductCard з різними states.

---

## Task 6: 1C sync — outbound quote (TODO documentation only)

**Файл:** `docs/SYNC_QUOTES_1C.md` (новий) — документація для 1С-адміна.

Описати endpoint спецефікацію:

- `GET /api/sync/quotes?since=<ISO>` — pull нові quotes для 1С
- `POST /api/sync/quotes/:id/quoted` — 1С пушить proposed price назад

**НЕ реалізовувати API endpoints у цій сесії** — тільки документація. Реалізація — окрема сесія коли 1С-адмін підтвердить готовність.

---

## Verification checklist

- [ ] DB migration applied without errors
- [ ] `/quote` page рендериться, валидує форму, submit працює
- [ ] Manager отримує Telegram notification з quote details
- [ ] Rate limit works: 4-й request у годину → 429
- [ ] `/admin/quotes` показує всі quotes; filter by status; respond saves
- [ ] Product cards показують correct stock badges (test з 0 / 1 / 3 / 10 available lots)
- [ ] CI all green

---

## Out of scope

- CSV bulk upload (видалено за рішенням E user-а)
- Volume discount display UI (видалено за рішенням C3)
- Auto-quote calculation (manual review only)
- Email notifications для quote (Telegram first; email — пізніше)
- SMS notifications
- Quote chat (back-and-forth беседа клієнт-менеджер) — поки тільки 1 round-trip

---

## Commit strategy

3 коміти:

1. `feat(db): add Quote model + status enum`
2. `feat(quote): API route + Zod validation + Telegram notification`
3. `feat(quote): UI page + admin management + stock indicators`

---

## Push

```bash
git push -u origin claude/session-22-quote-request
```
