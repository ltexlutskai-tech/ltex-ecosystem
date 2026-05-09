# E2E Tests

Playwright specs for L-TEX store. Auto-discovered by `playwright.config.ts`
(`testDir: "./e2e"`, chromium-only project, dev server on port 3000).

## Run locally

```bash
pnpm test:e2e
```

The harness auto-starts `pnpm --filter @ltex/store dev` if nothing is already
listening on `:3000` (`reuseExistingServer: !CI`).

## Test customer

`customer-flow.spec.ts` logs in with a stable fake phone:

- **Phone:** `+380999999991`
- **Name:** `E2E Test Customer`

The phone is intentionally fake but stable so test re-runs hit the same DB
row instead of leaking new customers. The login endpoint normalizes spaces
and stores the phone as `+380999999991`.

### Cleanup

If you ever need to wipe the test customer (e.g. to re-test the
"login flow creates customer" path on a fresh row):

```sql
DELETE FROM customers WHERE phone = '+380999999991';
```

The test is idempotent — `loginAsTestCustomer` upserts on each run via
the existing `findFirst → update | create` flow in
`apps/store/app/api/auth/customer/login/route.ts`. Per S82, the login
endpoint never overwrites `name`/`city` if the customer already set them
in `/account`.

## Specs

- `about-contacts.spec.ts` — about/contacts pages render
- `admin.spec.ts` — admin login page + auth redirects
- `cart-checkout.spec.ts` — cart from localStorage seed + min-weight rule
- `catalog.spec.ts` — catalog listing + filters
- `customer-flow.spec.ts` — guest price gate + login + cart entry (S85)
- `lots.spec.ts` — lots page filters + detail
- `navigation.spec.ts` — header + footer links
- `product.spec.ts` — product detail page
- `responsive.spec.ts` — mobile viewport sanity checks
- `search.spec.ts` — search box autocomplete + results
