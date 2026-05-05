# Bundle Size Baseline

**Snapshot date:** 2026-05-04 (commit `939391c`, branch `claude/cleanup-cicd-tooling-1H0jM`)
**Build mode:** standalone, production
**Next.js:** 15.5.14
**Node:** 20.x
**Build command:** `DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder pnpm --filter @ltex/store build`

## Pages

```
Route (app)                                       Size  First Load JS  Revalidate  Expire
┌ ○ /                                          7.34 kB         172 kB          1m      1y
├ ○ /_not-found                                  994 B         103 kB
├ ○ /about                                       133 B         132 kB
├ ƒ /admin                                     5.37 kB         131 kB
├ ƒ /admin/banners                             2.79 kB         135 kB
├ ƒ /admin/banners/[id]/edit                     136 B         136 kB
├ ƒ /admin/banners/new                           136 B         136 kB
├ ƒ /admin/categories                           2.2 kB         131 kB
├ ƒ /admin/customers                           1.84 kB         107 kB
├ ƒ /admin/featured                            4.35 kB         136 kB
├ ○ /admin/login                               62.6 kB         191 kB
├ ƒ /admin/lots                                4.94 kB         137 kB
├ ƒ /admin/orders                              5.21 kB         137 kB
├ ƒ /admin/products                            3.12 kB         135 kB
├ ƒ /admin/products/[id]                        2.9 kB         135 kB
├ ƒ /admin/products/new                          170 B         132 kB
├ ƒ /admin/promo                               3.33 kB         132 kB
├ ƒ /admin/rates                               2.52 kB         131 kB
├ ƒ /admin/sync-log                            2.39 kB         131 kB
├ ƒ /api/admin/chat/reply                        222 B         102 kB
├ ƒ /api/admin/stats                             222 B         102 kB
├ ƒ /api/cart                                    222 B         102 kB
├ ƒ /api/catalog                                 222 B         102 kB
├ ƒ /api/catalog/price-range                     222 B         102 kB
├ ƒ /api/categories                              222 B         102 kB
├ ƒ /api/cron/cleanup-viewlog                    222 B         102 kB
├ ƒ /api/health                                  222 B         102 kB
├ ƒ /api/mobile/auth                             222 B         102 kB
├ ƒ /api/mobile/chat                             222 B         102 kB
├ ƒ /api/mobile/chat/stream                      222 B         102 kB
├ ƒ /api/mobile/chat/unread                      222 B         102 kB
├ ƒ /api/mobile/favorites                        222 B         102 kB
├ ƒ /api/mobile/home                             222 B         102 kB
├ ƒ /api/mobile/notifications                    222 B         102 kB
├ ƒ /api/mobile/orders                           222 B         102 kB
├ ƒ /api/mobile/payments                         222 B         102 kB
├ ƒ /api/mobile/products/[id]/view               222 B         102 kB
├ ƒ /api/mobile/profile                          222 B         102 kB
├ ƒ /api/mobile/recommendations                  222 B         102 kB
├ ƒ /api/mobile/shipments                        222 B         102 kB
├ ƒ /api/newsletter                              222 B         102 kB
├ ƒ /api/orders                                  222 B         102 kB
├ ƒ /api/quick-order                             222 B         102 kB
├ ƒ /api/recommendations                         222 B         102 kB
├ ƒ /api/search                                  222 B         102 kB
├ ƒ /api/sync/lots                               222 B         102 kB
├ ƒ /api/sync/orders/export                      222 B         102 kB
├ ƒ /api/sync/products                           222 B         102 kB
├ ƒ /api/sync/rates                              222 B         102 kB
├ ƒ /api/telegram/webhook                        222 B         102 kB
├ ƒ /api/viber/webhook                           222 B         102 kB
├ ○ /cart                                      5.98 kB         161 kB
├ ƒ /catalog                                   2.83 kB         158 kB
├ ƒ /catalog/[categorySlug]                      241 B         156 kB
├ ƒ /catalog/[categorySlug]/[subcategorySlug]    241 B         156 kB
├ ○ /contacts                                  2.39 kB         131 kB
├ ƒ /lot/[barcode]                             3.55 kB         171 kB
├ ƒ /lots                                      4.22 kB         165 kB
├ ○ /manifest.webmanifest                        222 B         102 kB
├ ƒ /new                                         370 B         142 kB
├ ƒ /order/[id]/confirmation                   2.39 kB         131 kB
├ ƒ /order/[id]/status                           133 B         132 kB
├ ○ /privacy                                     171 B         106 kB
├ ƒ /product/[slug]                            8.06 kB         172 kB
├ ○ /returns                                     171 B         106 kB
├ ○ /robots.txt                                  222 B         102 kB
├ ƒ /sale                                        370 B         142 kB
├ ƒ /sitemap.xml                                 222 B         102 kB
├ ○ /terms                                       171 B         106 kB
├ ○ /top                                         370 B         142 kB          1m      1y
└ ○ /wishlist                                  5.23 kB         144 kB
```

## Shared chunks

```
+ First Load JS shared by all                   102 kB
  ├ chunks/3824-1f09d0c66d096487.js            46.1 kB
  ├ chunks/a4f3bcc6-fa73b6c9e18311f8.js        54.2 kB
  └ other shared chunks (total)                1.93 kB

ƒ Middleware                                   87.9 kB
```

## Notes

- Largest pages:
  - `/admin/login` — 62.6 kB / 191 kB First Load (Supabase auth UI)
  - `/product/[slug]` — 8.06 kB / 172 kB (after S59 redesign + S60 cart fixes)
  - `/` — 7.34 kB / 172 kB (homepage with banners + 4 product rails)
  - `/cart` — 5.98 kB / 161 kB (after S60 split into server wrapper + client)
- New pages from recent sessions:
  - `/lots` — 4.22 kB / 165 kB (S61 catalog-style grid)
  - `/lot/[barcode]` — 3.55 kB / 171 kB (S61 detail page)
  - `/wishlist` — 5.23 kB / 144 kB (S63 dual-section: products + lots)
- Shared chunks total: **102 kB First Load JS shared by all**.
- Middleware: 87.9 kB.

## Watch list

- If shared First Load JS exceeds **130 kB** → investigate (could be unintended package added globally).
- Any PR adding **>20 kB First Load JS** to an existing page → justify in PR description.
- If `/admin/login` First Load grows beyond **210 kB** → review Supabase Auth UI imports.
- Catalog pages (`/catalog`, `/catalog/[categorySlug]`) are currently 156–158 kB First Load — keep below 180 kB.

## How to refresh this baseline

```bash
DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder \
  pnpm --filter @ltex/store build
```

Copy the "Route (app)" table + "First Load JS shared by all" + "Middleware" lines from the build output. Update the snapshot date and commit SHA at the top.
