# Session 43 — Worker Task: DB ViewLog + Recommendations Engine

**Створено orchestrator-ом:** 2026-04-28
**Пріоритет:** P1 (mobile parity — пустий рейл "Рекомендоване для вас", немає трекінгу для подальшого ML)
**Очікуваний ефорт:** 4-6 годин
**Тип:** worker session
**Передумови:** S34 (mobile home) merged, `/api/mobile/home` працює

---

## Контекст

Mobile HomeScreen має 3 statyc rail-и (Топ / Акції / Новинки) з S34. Немає **персональних рекомендацій** — тобто нічого, що базується на тому, що конкретний користувач переглядав.

Web сайт також не має recommendations: `apps/store/app/(public)/page.tsx` показує статичні секції (featured / sale / new). Немає трекінгу переглядів.

S43 додає:

1. **DB ViewLog model** — мінімальна таблиця: який customer (опціонально, бо анонім дозволено), який product, коли, source.
2. **Tracking endpoint** — `POST /api/mobile/products/[id]/view` (auth optional). Fire-and-forget з mobile при відкритті product detail.
3. **Recommendations endpoint** — `GET /api/mobile/recommendations` повертає до 12 продуктів. Алгоритм: спершу те, що customer не дивився; потім — продукти з тих самих категорій, що user дивився; fallback — newest in stock.
4. **Mobile integration** — додати 4-й rail "Рекомендоване для вас" на HomeScreen + tracking call у ProductDetail screen (на mobile).

**Web НЕ чіпаємо** у цій сесії — окремий follow-up для web recommendations.

---

## Branch

`claude/session-43-viewlog-recommendations` від main.

---

## Hard rules

1. **Анонімний трекінг дозволено**: tracking endpoint приймає request без Bearer token — пише `customerId: null`. Це OK; потрібно для майбутнього "guest history" feature.
2. **Privacy**: НЕ зберігати IP, user-agent, чи будь-які PII. Тільки `customerId | null`, `productId`, `viewedAt`, `source`.
3. **Performance**: tracking endpoint — fire-and-forget на client. Backend пише в DB і повертає 204 No Content швидко (~5ms).
4. **Recommendations cache**: 60с edge cache на response (`Cache-Control: s-maxage=60` як у `/api/mobile/home`). Інакше polling вб'є DB.
5. **Limit**: ViewLog таблиця ростиме. У scope: створити, не cleanup. Cleanup (старші 90 днів — drop) — окрема follow-up задача.
6. **CI**: 255 unit baseline + format + typecheck + build green. Worker додає мінімум 4 нові тести (tracking POST, recommendations GET happy-path, anonymous tracking, recommendations fallback).
7. **Migration name**: `20260429_view_log` (наступний день після notifications, щоб order був чітким).
8. **Mobile recommendations rail** — стиль ідентичний існуючим рейлам (S34 `HorizontalProductRail`), не вигадувати новий компонент.

---

## Файли

### Backend (Next.js)

#### `packages/db/prisma/schema.prisma` (доповнити)

```prisma
// ─── Product View Log (recommendations + analytics) ──────────────────────────

model ViewLog {
  id         String   @id @default(cuid())
  customerId String?  @map("customer_id")
  productId  String   @map("product_id")
  source     String   @default("unknown") // "home" | "catalog" | "search" | "product_detail" | "unknown"
  viewedAt   DateTime @default(now()) @map("viewed_at")

  customer Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)
  product  Product   @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([customerId, viewedAt])
  @@index([productId, viewedAt])
  @@map("view_log")
}
```

Також додати у `Customer.viewLog ViewLog[]` і `Product.viewLog ViewLog[]`.

#### `packages/db/prisma/migrations/20260429_view_log/migration.sql` (new)

```sql
-- Product view log (Session 43)
CREATE TABLE IF NOT EXISTS "view_log" (
    "id"          TEXT          NOT NULL,
    "customer_id" TEXT,
    "product_id"  TEXT          NOT NULL,
    "source"      TEXT          NOT NULL DEFAULT 'unknown',
    "viewed_at"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "view_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "view_log_customer_id_viewed_at_idx"
    ON "view_log"("customer_id", "viewed_at");

CREATE INDEX IF NOT EXISTS "view_log_product_id_viewed_at_idx"
    ON "view_log"("product_id", "viewed_at");

ALTER TABLE "view_log"
    ADD CONSTRAINT "view_log_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "view_log"
    ADD CONSTRAINT "view_log_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
```

#### `apps/store/app/api/mobile/products/[id]/view/route.ts` (new)

POST endpoint. Auth optional (Bearer header decoded if present, else `customerId = null`).

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { tryMobileSession } from "@/lib/mobile-auth"; // worker додає helper що НЕ повертає 401

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: productId } = await params;
  const session = tryMobileSession(request); // null якщо немає або invalid token
  const customerId = session?.customerId ?? null;

  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const source =
    typeof body.source === "string" &&
    ["home", "catalog", "search", "product_detail"].includes(body.source)
      ? body.source
      : "unknown";

  // Перевірка існування продукту — щоб FK не падав
  const productExists = await prisma.product.count({ where: { id: productId } });
  if (!productExists) {
    return new NextResponse(null, { status: 204 }); // не leak що продукт зник
  }

  await prisma.viewLog.create({
    data: { customerId, productId, source },
  });

  return new NextResponse(null, { status: 204 });
}
```

**Важливо:** `tryMobileSession` — новий helper у `apps/store/lib/mobile-auth.ts`. Аналог `requireMobileSession` але повертає `null` замість 401, якщо немає token. Worker додає його окремо.

#### `apps/store/app/api/mobile/recommendations/route.ts` (new)

GET endpoint. Без auth — повертає рекомендації навіть для анонімних (тоді алгоритм fallback "newest in stock"). З auth — персоналізує.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { tryMobileSession } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = tryMobileSession(request);
  const customerId = session?.customerId ?? null;

  let recommendations;

  if (customerId) {
    // 1) Знайти категорії, які user дивився за останні 30 днів
    const recentViews = await prisma.viewLog.findMany({
      where: {
        customerId,
        viewedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      include: { product: { select: { categoryId: true } } },
      orderBy: { viewedAt: "desc" },
      take: 20,
    });
    const seenProductIds = recentViews.map((v) => v.productId);
    const seenCategoryIds = [
      ...new Set(recentViews.map((v) => v.product.categoryId).filter(Boolean)),
    ];

    if (seenCategoryIds.length > 0) {
      // 2) Топ-12 продуктів з тих категорій, не переглянутих, in stock
      recommendations = await prisma.product.findMany({
        where: {
          inStock: true,
          categoryId: { in: seenCategoryIds as string[] },
          id: { notIn: seenProductIds },
        },
        take: 12,
        orderBy: { createdAt: "desc" },
        include: { /* same as productInclude у /api/mobile/home */ },
      });
    }
  }

  // Fallback: newest in stock (для анонім або якщо нема recent views)
  if (!recommendations || recommendations.length === 0) {
    recommendations = await prisma.product.findMany({
      where: { inStock: true },
      take: 12,
      orderBy: { createdAt: "desc" },
      include: { /* productInclude */ },
    });
  }

  return NextResponse.json(
    { products: recommendations.map(mapProduct) }, // reuse mapProduct з /api/mobile/home
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
  );
}
```

**Важливо:** worker екстрактить `productInclude` і `mapProduct` з `apps/store/app/api/mobile/home/route.ts` у спільний `apps/store/app/api/mobile/_shared.ts` (або `lib/mobile-product-shape.ts`) щоб не дублювати. Інакше drift між endpoints.

#### `apps/store/lib/mobile-auth.ts` (доповнити)

Додати `tryMobileSession(request)` — як `requireMobileSession`, але повертає `null` коли token відсутній/невалідний, замість `NextResponse 401`.

#### Тести

- `apps/store/app/api/mobile/products/[id]/view/route.test.ts` — 4 cases: track with auth, track anonymous, track non-existent product (204 silent), invalid source defaults to "unknown".
- `apps/store/app/api/mobile/recommendations/route.test.ts` — 4 cases: anonymous fallback (newest), authed з recent views (категорійна), authed без views (fallback newest), excluded seen products.

### Mobile (Expo)

#### `apps/mobile-client/src/lib/api.ts` (доповнити)

```typescript
export const recommendationsApi = {
  async get() {
    return apiFetch<{ products: WebCatalogProduct[] }>("/recommendations");
  },
};

export const productsApi = {
  async trackView(productId: string, source: "home" | "catalog" | "search" | "product_detail") {
    // Fire-and-forget — не await, не throw
    apiFetch(`/products/${productId}/view`, {
      method: "POST",
      body: JSON.stringify({ source }),
    }).catch(() => {});
  },
};
```

#### `apps/mobile-client/src/screens/home/HomeScreen.tsx` (доповнити)

Додати 4-й rail "Рекомендоване для вас" перед "Новинки". Ховати rail якщо `recommendations.length === 0` (наприклад у guest без даних і навіть fallback порожній).

```typescript
const [recommendations, setRecommendations] = useState<WebCatalogProduct[]>([]);

// у useEffect / refresh — паралельно з homeApi.get():
const recs = await recommendationsApi.get();
setRecommendations(recs.products);

// у JSX перед "Новинки":
{recommendations.length > 0 && (
  <HorizontalProductRail
    title="Рекомендоване для вас"
    products={recommendations}
    onProductPress={handleProductPress}
  />
)}
```

#### `apps/mobile-client/src/screens/product/ProductDetailScreen.tsx`

(Якщо існує — перевірити структуру; якщо placeholder — пропустити tracking call і додати TODO коментар).

```typescript
useEffect(() => {
  productsApi.trackView(productId, "product_detail");
}, [productId]);
```

ProductCard на Home / Catalog / Search НЕ tracking-ити безпосередньо (шум: пройшов мимо ≠ дивився). Тільки product_detail відкриває view event.

---

## Verification (worker pre-push)

1. `pnpm format:check` — ✅
2. `pnpm --filter @ltex/db exec prisma generate` — ✅ (Prisma client generated)
3. `pnpm -r typecheck` — ✅ 6/6
4. `pnpm -r test` — ≥263 (255 baseline + 8 нових з S43)
5. ASCII-only `deploy.ps1` (не чіпали) — ✅

**Migration НЕ застосовувати на DB через worker session** — це orchestrator робить вручну на сервері (як з S36).

---

## Out-of-scope

- Web recommendations rail на homepage (`apps/store/app/(public)/page.tsx`)
- Cleanup job для ViewLog (drop > 90 днів)
- Real-time recommendations (collaborative filtering, ML)
- Tracking з catalog grid / search results (тільки product_detail entry)
- Admin dashboard "popular products" (через ViewLog) — окрема задача
- Дeduplication: один user view одного продукту 100 разів = 100 рядків. OK для зараз; cleanup пізніше.

---

## Branch + commit + push

Branch: `claude/session-43-viewlog-recommendations`
Commit message: `feat(s43): viewlog model + recommendations engine + mobile rail`
Push на feature branch — НЕ мерджити в main. Orchestrator review-ить і мерджить.

---

## Deploy notes (для orchestrator після merge)

Перед `deploy.ps1` на сервері:

```powershell
$env:DATABASE_URL = "..."  # з apps/store/.env
$env:DIRECT_URL = "..."
pnpm --filter @ltex/db exec prisma migrate deploy
```

Очікувано: `Applying migration "20260429_view_log"`. Без цього `recommendations` і `view` endpoints падатимуть з `relation "view_log" does not exist`.

Supabase migration — skip (per session 36 decision, Supabase DB = cold backup, не active).
