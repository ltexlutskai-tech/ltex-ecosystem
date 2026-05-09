# Code Review Report — Sessions 71-81

**Date:** 2026-05-09
**Reviewer:** general-purpose agent (Claude)
**Scope:** 11 worker sessions merged into main today
**Source commits:** S71 `230ea51` → S81 `6e102f2`

Source for follow-up fix session: `docs/SESSION_82_CODE_REVIEW_FIXES.md`.

---

## 🔴 Critical (must fix before next deploy)

- **`apps/store/app/api/auth/customer/login/route.ts:102-111`** — Cart-merge accepts `sessionId` from request body without verifying ownership. An attacker can submit any victim's `localStorage.ltex-session-id` value during login and absorb the victim's guest cart into the attacker's customer account; the original guest cart is then deleted. Verify the sessionId via a signed cookie or skip merge when sessionId came from JSON body.

- **`apps/store/app/(store)/product/[slug]/page.tsx:374-388`** — Price gate leak: `LotReviews` is passed `lots[].priceEur` (real EUR) regardless of `isAuthed`. The client component `lot-review-card.tsx:99-104` only hides the visual but the prop ships in the React server payload — guests can read every lot's wholesale price via View Source / DevTools. Strip `priceEur` server-side (set to 0 or omit) when `!isAuthed`, mirroring what `lots/page.tsx:504` already does.

- **`apps/store/app/api/customer/favorites/sync/route.ts:23-46`** — No rate limit. Any authenticated cookie can POST 500 productIds 1000×/sec, hammering Prisma `findMany` and `createMany` with unbounded validation work. Add `rateLimit("favorites-sync:${customer.id}", { windowMs: 60_000, max: 30 })`.

- **`apps/store/app/api/auth/customer/login/route.ts:76-86`** — Returning login overwrites Customer.name/city silently every login, clobbering whatever the user edited via `/account`. UX/data-integrity bug: only set `name`/`city` on `wasCreated`, or only when current DB row is null/empty.

- **`apps/store/app/api/catalog/numeric-ranges/route.ts:5-17`** — Returns hardcoded `1..1000` constants while pretending to be a dynamic endpoint cached for 24h. Either delete the route and inline the constant in `catalog-filters.tsx`, or actually compute `min/max` from `prisma.product.aggregate`. Right now the network round-trip exists but does no work and merely delays slider rendering by ~100ms.

---

## 🟡 Important (fix this week)

- **`apps/store/lib/wishlist.tsx:117-179`** — `useEffect` dependency array includes `items`; the merge effect mutates `items` via `setItems` which retriggers the effect. The `lastSyncedCustomerIdRef` guard prevents the network call but still re-runs the effect body on every wishlist change while logged in. Drop `items` from deps or read it via a ref.

- **`apps/store/lib/admin-customers.ts:68-117`** — `fetchPageByLastOrder` runs an N+2 pattern: SELECT IDs via raw SQL, then a second `findMany`, plus two `groupBy` aggregates afterwards. For 50-row pages this is fine, but the customer-list `findMany` already could `orderBy` last-order via Prisma `_max` in a single query — simplify or keep but document.

- **`apps/store/app/admin/customers/export/route.ts:40-46`** — Hardcoded `pageSize: 10000`. With 805 products and growing customer base, this works today, but there's no streaming / chunking; on a large customer DB the response will OOM. Add a guard (e.g. cap at 5k with a warning) or stream as chunks.

- **`apps/store/components/store/recently-viewed-section.tsx:42-46`** — `item.priceEur` is rendered raw from `localStorage`. If a user was authed previously, log out, the prices persist client-side. Compare against `useCustomer()` and hide when guest.

- **`apps/store/lib/notifications.ts:155-167`** — `notifyNewLead` uses `NEWSLETTER_TELEGRAM_CHAT_ID` but `notifyNewOrder` uses `TELEGRAM_CHAT_ID`. New leads will go to the newsletter channel — likely intentional but inconsistent: clarify in `.env.example` or alias.

- **`apps/store/lib/catalog.ts:165-171`** — Range overlap filter uses `unitsPerKgMax: { gte: filterMin }`. When a product has `unitsPerKgMax = NULL` (most products without parsed range), Postgres treats `NULL gte X` as unknown → row excluded. This silently hides ~70 % of products as soon as a slider moves off default. Either backfill min/max columns from the existing parsed string, or add `OR { unitsPerKgMax: null }` clauses.

- **`apps/store/scripts/import-catalog-from-excel.ts:391`** — `prisma.category.delete(...).catch(() => {})` swallows real errors (FK violation, but also DB connection drop). Log the error message instead of silent ignore.

- **`apps/store/app/api/recommendations/route.ts:24-86`** — No rate limit. `seenIds` are unauthenticated and trigger up to 2 Prisma queries; `seen=,,,a,b,…` (20 ids) is bounded but the endpoint is otherwise free hammered.

- **`apps/store/app/(store)/account/profile-form.tsx:127-141`** — `notes` field is editable by any logged-in user but the same column is rendered as "admin notes" in `admin-customers/page.tsx:262` and CSV export. Either rename one (`Customer.adminNotes`) or filter what admins see.

- **`apps/store/app/api/auth/customer/login/route.ts:125-175`** — `mergeGuestCartIntoCustomer` does N inserts in a loop with `.catch(() => {})`; if customer has 100 cart items, that's 100 round-trips. Use `prisma.cartItem.createMany({ data: [...], skipDuplicates: true })` since `@@unique([cartId, lotId])` was dropped (per S59 notes).

---

## 🟢 Nice-to-have

- **`apps/store/lib/customer-auth.ts:163-173`** — `stripPricesForGuests` is a generic over `{ prices: unknown[] }` that returns `T[]` with `prices: []` — TypeScript compiles, but tighter signature (`Prisma.Price[]`) would prevent silent shape drift.

- **`apps/store/components/store/range-with-inputs.tsx:46-56`** — `commitFromDrafts` calls `onCommit` even when the value is unchanged; click-blur on an already-correct value triggers a router push and re-render. Skip when `finalLo === lo && finalHi === hi`.

- **`apps/store/components/store/catalog-filters.tsx:111-162`** — Three nearly-identical `useEffect` blocks for price/units/weight bounds; consolidate into a custom hook `useUrlSyncedRange`.

- **`apps/store/components/store/lots-filters-form.tsx:16-17`** — Duplicate `DEFAULT_*_RANGE` constants from `catalog-filters.tsx`. Move to shared.

- **`apps/store/scripts/import-catalog-from-excel.ts:797-838`** — Sequential `await upsertProductRow` over 800+ rows. A `for await … of pMap(…, { concurrency: 4 })` would cut runtime by ~4×.

- **Dead code** — `dict.catalog.sizesLabel` / `sizesPlaceholder` (`lib/i18n/uk.ts:45-46`) are leftover from S74 sizes filter that S80 removed; reference search shows zero callers.

- **`apps/store/app/api/auth/customer/login/route.ts:91-98`** — `notifyNewLead(...).catch(() => {})` swallows the `console.warn` paths inside the function — the wrapper is redundant since `notifyNewLead` already catches internally; remove either layer.

---

## Patterns / themes

The price-gate work is broadly correct (every public listing strips server-side via `stripPricesForGuests` or `getCatalogProducts`), but the approach is "remove field from JSON payload" rather than "don't load it" — easy to regress because every new listing component must remember to strip. The biggest leak (`LotReviews` props on the product page) shows the pattern's fragility. Two leaks (`RecentlyViewedSection`, lot-review-card props) are actually reachable in DevTools today. Consider centralising at the Prisma include level — wrap `getProduct/getLot/getCatalogProducts` with a "guest view" returning `{ ...product, prices: [], lots: lots.map(l => ({...l, priceEur: 0})) }` so individual pages can't leak.

The S71-S81 sessions show consistent patterns: server-side validation (Zod), HMAC-signed cookie, structured logging without PII, fallback rates / catch-then-empty for build-time DB unavailability — all good. Two recurring weak spots: (1) cart/wishlist merge endpoints lack rate limits and ownership checks; (2) auth+lead capture overwrites stored fields on every login. Range filter UX has been re-worked four times (S72→S74→S80→S81) and the resulting code in `catalog-filters.tsx` / `lots-filters-form.tsx` carries vestigial state and duplicated effects from each iteration.

---

## Estimated effort

**6-9 session-hours** for all 🔴 + 🟡 (4-5h critical, 2-4h important).

🟢 nice-to-have items can be batched separately or absorbed into future feature work.
