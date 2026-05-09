# Session 82 — Code review fixes from S71-S81 audit

**Type:** Worker session
**Branch:** `claude/code-review-fixes-{XXXX}`
**Goal:** Закрити 5 critical security/price-gate issues + 7 important UX/perf issues, виявлені у code review після S71-S81 (11 worker сесій merged за день).

**Source:** `docs/CODE_REVIEW_S71_S81.md` (orchestrator буде commit-ити окремо) — деталі не дублювати, focus on fixes.

---

## ⚠️ HARD RULES

1. **DO NOT change DB schema** — усі fixes на app-рівні. Existing колонки лишаються.
2. **DO NOT touch admin/mobile auth** — це окремий код від S73.
3. **Centralize price-stripping**: фінальна мета — нові listing components не мають ризику leak. Але для S82 — конкретні таргетовані фікси, не grand refactor.
4. **DO NOT introduce new dependencies**.
5. **Test coverage**: кожен 🔴 fix потребує тест.
6. **Don't break** S73 auth, S75 leads dashboard, S80 oversize logic — тільки точкові правки.

---

## 🔴 Critical fixes

### Fix 1: Cart-merge sessionId ownership

**File:** `apps/store/app/api/auth/customer/login/route.ts` (~line 102-111, mergeGuestCartIntoCustomer)

**Issue:** `sessionId` приходить з request body — атакер може ввести чужий sessionId і "захопити" guest cart жертви.

**Fix:** Видали merge через body sessionId. Замість того читай `sessionId` **тільки з cookie** (HTTP-only `ltex_session` cookie якщо існує) або зовсім видали merge функцію якщо її не можна безпечно реалізувати без додаткового tracking.

Альтернатива — sign sessionId before send. Складніше. Найкращий шлях — **спрощення**: якщо guest cart має ownership через cookie (а не localStorage), читаємо з cookie. Якщо тільки з localStorage — drop cart merge feature з S73 (це маленька regression, але safer).

Перевір як `lib/cart.tsx` зберігає sessionId. Якщо в localStorage — drop merge. Якщо в cookie — використовуй cookie.

**Test:** request з фейковим sessionId — не повинен переносити чужий cart.

### Fix 2: LotReviews price leak

**Files:**

- `apps/store/app/(store)/product/[slug]/page.tsx` (~line 374-388, де `<LotReviews lots={...} />`)
- `apps/store/components/store/lot-review-card.tsx` (line 99-104, де `priceEur` приходить як prop)

**Issue:** Server передає `priceEur` (real EUR) у React payload навіть для гостя. Client-component приховує візуально, але DevTools/View Source показують ціни. **Price gate зламаний для гостя на product page.**

**Fix у `product/[slug]/page.tsx`:**

```typescript
const customer = await getCurrentCustomer();
const lotsForReviews = customer
  ? lots
  : lots.map((l) => ({ ...l, priceEur: 0, salePriceEur: null }));
// ... потім <LotReviews lots={lotsForReviews} ... />
```

Лоти все одно видно (відеоогляди), але ціни 0 → `<PriceOrLogin>` показує CTA.

**Test:** server-render `<LotReviews>` без customer cookie → знайти `priceEur` у JSON payload з 0.

### Fix 3: favorites-sync rate limit

**File:** `apps/store/app/api/customer/favorites/sync/route.ts`

**Issue:** Authenticated cookie може bombard endpoint без обмеження.

**Fix:** Перед main logic:

```typescript
import { rateLimit } from "@/lib/rate-limit";
// ...
const limited = await rateLimit(request, `favorites-sync:${customer.id}`, {
  max: 10,
  window: 60_000,
});
if (limited) return limited; // 429
```

Перевір signature `rateLimit` (вона уже використовується у login/quick-order routes — copy-paste pattern).

**Test:** 11-й request у тій самій хвилині → 429.

### Fix 4: Login no-overwrite

**File:** `apps/store/app/api/auth/customer/login/route.ts` (~line 76-86, де update name/city)

**Issue:** На кожен повторний login (existing customer) — перезаписує name та city значеннями з form. Але customer міг змінити їх у `/account`. UX bug.

**Fix:** Update name/city **тільки** коли DB значення порожнє/null:

```typescript
} else {
  const updates: { name?: string; city?: string | null } = {};
  // Update name only if currently empty/whitespace
  if (!customer.name?.trim() && parsed.data.name?.trim()) {
    updates.name = parsed.data.name.trim();
  }
  // Update city only if currently null and login provided one
  if (customer.city == null && parsed.data.city) {
    updates.city = parsed.data.city;
  }
  if (Object.keys(updates).length > 0) {
    await prisma.customer.update({ where: { id: customer.id }, data: updates });
  }
}
```

Customer має зміни у `/account` — login їх не перезаписує.

**Test:** customer з `city = "Львівська"` робить login з вибраним "Київська" → DB лишається "Львівська".

### Fix 5: numeric-ranges decision

**File:** `apps/store/app/api/catalog/numeric-ranges/route.ts`

**Issue:** Endpoint повертає hardcoded `{1,1000}/{1,1000}` з 24h cache + force-static. Network round-trip без роботи.

**Fix:** Видали endpoint повністю + inline у `catalog-filters.tsx` як constants:

```typescript
// catalog-filters.tsx
const UNITS_RANGE = { min: 1, max: 1000 };
const WEIGHT_RANGE = { min: 1, max: 1000 };
// замість fetch(/api/catalog/numeric-ranges)
```

Видали:

- `apps/store/app/api/catalog/numeric-ranges/route.ts`
- `apps/store/app/api/catalog/numeric-ranges/route.test.ts`

Видали fetch у `catalog-filters.tsx` + `lots-filters-form.tsx`.

**Test:** existing tests мають продовжувати працювати без route file.

---

## 🟡 Important fixes

### Fix 6: catalog.ts range filter NULL handling

**File:** `apps/store/lib/catalog.ts` (~line 165-171, `unitsPerKgMax: { gte: filterMin }`)

**Issue:** Коли `unitsPerKgMax = NULL` (не parsed з string) → Postgres `NULL gte X` = unknown → row excluded. Слайдер ховає 70% продуктів коли зрушений.

**Fix:** Use OR clause включати NULL:

```typescript
if (unitsPerKgMin != null) {
  where.AND = [
    ...(where.AND ?? []),
    {
      OR: [{ unitsPerKgMax: { gte: unitsPerKgMin } }, { unitsPerKgMax: null }],
    },
  ];
}
if (unitsPerKgMax != null) {
  where.AND = [
    ...(where.AND ?? []),
    {
      OR: [{ unitsPerKgMin: { lte: unitsPerKgMax } }, { unitsPerKgMin: null }],
    },
  ];
}
// Same for unitWeight
```

Tradeoff: продукти без numeric data завжди показуються, навіть коли filter активний. Це краще ніж ховати 70% mid-slider.

**Test:** product з `unitsPerKgMin = NULL` + filter `unitsPerKgMin=5&unitsPerKgMax=20` → product повертається.

### Fix 7: recently-viewed price gate

**File:** `apps/store/components/store/recently-viewed-section.tsx`

**Issue:** Показує `item.priceEur` з localStorage гостям. Юзер залогінений → log out → ціни лишилися у localStorage.

**Fix:** Use `useCustomer()` hook (S73) → коли null → render `<PriceOrLogin priceEur={null} />` замість real price.

Або просто очисти `priceEur` з saved item, рендеримо без ціни (тільки image+name+link), guest бачить спрощену плитку.

**Test:** mount component without customer → no `€XX.XX` у DOM.

### Fix 8: wishlist useEffect re-runs

**File:** `apps/store/lib/wishlist.tsx` (~line 117-179)

**Issue:** `useEffect` deps включає `items`; effect mutates `items` → re-trigger.

**Fix:** Винеси `items` у ref:

```typescript
const itemsRef = useRef(items);
useEffect(() => {
  itemsRef.current = items;
}, [items]);

useEffect(() => {
  // ... use itemsRef.current instead of items
}, [customer?.id]); // тільки customer.id
```

**Test:** add wishlist item while logged in → fetch не fires повторно.

### Fix 9: customers/export pageSize cap

**File:** `apps/store/app/admin/customers/export/route.ts` (~line 40-46)

**Issue:** Hardcoded `pageSize: 10000` — OOM на великих datasets.

**Fix:**

```typescript
const MAX_EXPORT = 5000;
const { items, total } = await listCustomers({
  ...filter,
  pageSize: MAX_EXPORT,
});
// add header X-Truncated якщо total > MAX_EXPORT
const truncated = total > MAX_EXPORT;
return new NextResponse(csvLines, {
  headers: {
    "Content-Type": "...",
    ...(truncated ? { "X-Truncated": `${total - MAX_EXPORT}` } : {}),
  },
});
```

Якщо truncated — admin page показує warning "Експортовано 5000 з N. Використайте filter щоб звузити."

### Fix 10: cart merge createMany batch

**File:** `apps/store/app/api/auth/customer/login/route.ts` (mergeGuestCartIntoCustomer, ~line 125-175)

**Issue:** N×INSERT loop з catch — повільно для 100 items.

**Fix (тільки якщо Fix 1 не drop merge):**

```typescript
await prisma.cartItem.createMany({
  data: guestCartItems.map((item) => ({
    cartId: customerCart.id,
    lotId: item.lotId,
    productId: item.productId,
    quantity: item.quantity,
    priceEur: item.priceEur,
  })),
  skipDuplicates: true,
});
```

`@@unique([cartId, lotId])` був dropped у S59 — `skipDuplicates: true` ловить duplicates за іншими constraints.

### Fix 11: notifyNewLead → newsletter chat clarification

**File:** `apps/store/lib/notifications.ts` (~line 155-167)

**Issue:** `notifyNewLead` шле у `NEWSLETTER_TELEGRAM_CHAT_ID`, `notifyNewOrder` — у `TELEGRAM_CHAT_ID`. Можливо умисно (newsletter group монаджеру), але не явно.

**Fix:** Додай JSDoc comment у `notifyNewLead`:

```typescript
/**
 * Sends a "new customer lead" notification to the manager Telegram group.
 * Reuses NEWSLETTER_TELEGRAM_CHAT_ID — the same group that gets newsletter
 * subscriptions, since both are lead-capture events for the same audience.
 * For order notifications use TELEGRAM_CHAT_ID instead.
 */
```

Можна також у `.env.example` написати "lead capture + newsletter signups go to NEWSLETTER_TELEGRAM_CHAT_ID; new orders go to TELEGRAM_CHAT_ID".

### Fix 12: Notes field collision

**Files:**

- `apps/store/app/(store)/account/profile-form.tsx` — customer редагує `notes`
- `apps/store/app/admin/customers/page.tsx` — admin читає `notes` як internal notes

**Issue:** Same DB column для customer self-edit і admin-only notes. Customer може напичкати ним що завгодно — admin побачить як "свої" нотатки.

**Fix:** Простіший фікс — **видалити `notes` з customer profile form** (S73 додав необдумано). Admin notes лишаються admin-only.

У `profile-form.tsx` — видали textarea+state для notes. У payload action — видали з updates.

(Long-term — додати окрему `customer.adminNotes` колонку. Для S82 — швидке rollback з форми.)

### Fix 13: dead i18n keys

**File:** `apps/store/lib/i18n/uk.ts` (~line 45-46)

Видали:

- `dict.catalog.sizesLabel`
- `dict.catalog.sizesPlaceholder`

Це leftover від S74 sizes filter (видалено у S80).

---

## 🟢 Optional (якщо є час)

- `range-with-inputs.tsx` — skip `onCommit` коли value unchanged
- `catalog-filters.tsx` — extract `useUrlSyncedRange` hook
- `lots-filters-form.tsx` — dedupe `DEFAULT_*_RANGE` з catalog-filters

---

## Acceptance criteria

- [ ] `pnpm format:check`/`typecheck`/`test`/`build` зелені
- [ ] **Fix 1:** Cart-merge не приймає sessionId з body. Test passes.
- [ ] **Fix 2:** `<LotReviews lots>` без customer → priceEur=0 у server payload (DevTools перевірка). Test passes.
- [ ] **Fix 3:** favorites-sync 429 на 11-й request у minute. Test passes.
- [ ] **Fix 4:** Login не перезаписує name/city якщо у DB значення є. Test passes.
- [ ] **Fix 5:** `/api/catalog/numeric-ranges` видалено. catalog-filters використовує inline constants.
- [ ] **Fix 6:** Range filter не excludes products з NULL min/max. Test passes.
- [ ] **Fix 7:** `<RecentlyViewedSection>` без customer → нема `€` у DOM.
- [ ] **Fix 8:** wishlist effect не re-fires на add/remove items.
- [ ] **Fix 9:** customers export capped at 5000 + X-Truncated header.
- [ ] **Fix 10:** cart merge через `createMany` (skip якщо Fix 1 drop merge).
- [ ] **Fix 11:** JSDoc на `notifyNewLead` пояснює chat-id choice.
- [ ] **Fix 12:** customer profile form без `notes` field. Admin сторінка notes-у не змінено.
- [ ] **Fix 13:** dead i18n keys видалені.
- [ ] Push на `claude/code-review-fixes-{XXXX}` (НЕ merge!)

---

## User-action post-merge

`.\scripts\deploy.ps1` — UI + code redeploy (без env, без migration)

---

## Reference

- Code review report (subagent output) — переслано окремо
- `apps/store/lib/customer-auth.ts` — `getCurrentCustomer`, `stripPricesForGuests`
- `apps/store/lib/rate-limit.ts` — pattern reuse
- `apps/store/lib/cart.tsx` — sessionId origin (cookie vs localStorage?)
- `apps/store/lib/wishlist.tsx` — useEffect to fix
- `apps/store/lib/catalog.ts` — searchProducts where logic
