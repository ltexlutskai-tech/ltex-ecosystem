# Session 48 — Worker Task: Web Recommendations Rail

**Створено orchestrator-ом:** 2026-04-28
**Пріоритет:** P2 (web parity з mobile S43 — використовує існуючий recommendations engine)
**Очікуваний ефорт:** 2-3 години
**Тип:** worker session
**Передумови:** S43 merged (mobile recommendations engine), S47 merged

---

## Контекст

Mobile зараз має 4-й rail "Рекомендоване для вас" (S43, читає з ViewLog DB). Web має 8 секцій на homepage: banners → categories → featured → sale → new → video reviews → recently-viewed → testimonials. **Recommendations відсутні.**

Web users анонімні (customer auth ще не зроблений — спец S21 PENDING). Тому стандартний серверний ViewLog → category-match algorithm не персоналізує (всі customerId=null).

Рішення: web передає **client-side список переглянутих product IDs** з localStorage у запит. Server бере categories тих продуктів і повертає 12 нових з тих самих категорій.

Існуючий `useRecentlyViewed` (apps/store/lib/recently-viewed.tsx) уже тримає список slugs у localStorage `ltex-recently-viewed`. Просто переробляємо/додаємо щоб віддавати `id` теж.

S48 додає:

1. New `/api/recommendations` endpoint (`?seen=id1,id2,...`) — server-side category match.
2. New `RecommendationsSection` (client component) — читає `useRecentlyViewed` IDs, fetch endpoint, renders 6-12 карток у grid.
3. Вставка section на homepage перед "Нещодавно переглянуті" (інакше дублює).
4. **НЕ** додаємо web view tracking endpoint — recently-viewed localStorage достатньо як input. (Mobile-side tracking у DB лишається бо там auth є.)

---

## Branch

`claude/session-48-web-recommendations` від main.

---

## Hard rules

1. НЕ дублювати existing recommendations logic — переиспользувати спільний helper з `apps/store/lib/mobile-product-shape.ts` (вже екстрактнутий у S43).
2. Endpoint cache: 60с edge (`Cache-Control: public, s-maxage=60, stale-while-revalidate=120`) як у `/api/mobile/recommendations`.
3. Empty state — якщо `seen` array порожній або жодних категорій не знайдено — вернути newest-in-stock (12). Інакше user без перегляду нічого не побачить.
4. Web `RecommendationsSection` — render тільки якщо API повертає продукти (`length > 0`). Інакше hidden (не показувати empty section).
5. localStorage shape `useRecentlyViewed`: items мають `slug`, але **НЕ мають `id`**. Worker додає `id` field у `RecentlyViewedItem` interface і модифікує addItem caller.
6. Backward-compat: existing localStorage entries без `id` — silent skip у recommendations. Після першого нового view — заповниться.
7. CI: 271 unit baseline + format + typecheck + build green. +2 test cases (endpoint with seen=, endpoint fallback).

---

## Файли

### 1. New `/api/recommendations` endpoint

**`apps/store/app/api/recommendations/route.ts`** (new)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import {
  mobileProductInclude,
  mapMobileProduct,
  type MobileRawProduct,
} from "@/lib/mobile-product-shape";

export const dynamic = "force-dynamic";

const RESULT_LIMIT = 12;
const SEEN_LIMIT = 20; // ignore long lists, only consider 20 most-recent

/**
 * GET /api/recommendations?seen=id1,id2,id3
 *
 * Web-side recommendations. Anonymous (no customer auth yet on web).
 * Algorithm: take categories of "seen" products, return up to 12 newest
 * in-stock products from those categories that are NOT in seen list.
 * Falls back to newest in-stock if seen is empty or yields no categories.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const seenRaw = searchParams.get("seen") ?? "";
  const seenIds = seenRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, SEEN_LIMIT);

  let products: MobileRawProduct[] | null = null;

  if (seenIds.length > 0) {
    const seenProducts = await prisma.product.findMany({
      where: { id: { in: seenIds } },
      select: { categoryId: true },
    });
    const seenCategoryIds = [
      ...new Set(
        seenProducts
          .map((p) => p.categoryId)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];

    if (seenCategoryIds.length > 0) {
      products = (await prisma.product.findMany({
        where: {
          inStock: true,
          categoryId: { in: seenCategoryIds },
          id: { notIn: seenIds },
        },
        take: RESULT_LIMIT,
        orderBy: { createdAt: "desc" },
        include: mobileProductInclude,
      })) as unknown as MobileRawProduct[];
    }
  }

  if (!products || products.length === 0) {
    products = (await prisma.product.findMany({
      where: { inStock: true },
      take: RESULT_LIMIT,
      orderBy: { createdAt: "desc" },
      include: mobileProductInclude,
    })) as unknown as MobileRawProduct[];
  }

  return NextResponse.json(
    { products: products.map(mapMobileProduct) },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
```

**`apps/store/app/api/recommendations/route.test.ts`** (new) — 2-3 cases:

- Empty `seen` → fallback returns newest products
- `seen` with valid IDs → returns products from same categories, excluding seen
- `seen` with non-existent IDs → fallback newest

### 2. Add `id` to `RecentlyViewedItem`

**`apps/store/lib/recently-viewed.tsx`** — додати `id: string` field у interface:

```typescript
export interface RecentlyViewedItem {
  id: string; // NEW
  slug: string;
  name: string;
  quality: string;
  imageUrl: string | null;
  priceEur: number | null;
  priceUnit: string;
  viewedAt: number;
}
```

**Backward-compat** у `useEffect` що завантажує з localStorage:

```typescript
useEffect(() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as RecentlyViewedItem[];
      // Drop entries without id (old format) — будуть replaced коли user view продукт знову
      setItems(parsed.filter((item) => typeof item.id === "string"));
    }
  } catch {}
}, []);
```

**Caller** (грубо `apps/store/app/(store)/product/[slug]/page.tsx` або client wrapper) — передавати `id` коли викликає `addItem`. Worker знаходить call site і додає `id`.

### 3. New `RecommendationsSection`

**`apps/store/components/store/recommendations-section.tsx`** (new)

```typescript
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, Badge } from "@ltex/ui";
import { QUALITY_LABELS, type QualityLevel } from "@ltex/shared";
import { useRecentlyViewed } from "@/lib/recently-viewed";

interface ApiProduct {
  id: string;
  slug: string;
  name: string;
  quality: string;
  priceUnit: string;
  images: { url: string; alt: string }[];
  prices: { amount: number; currency: string; priceType: string }[];
}

export function RecommendationsSection() {
  const { items } = useRecentlyViewed();
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const seenIds = items.map((i) => i.id).filter(Boolean).slice(0, 20);
    const url = `/api/recommendations${seenIds.length > 0 ? `?seen=${seenIds.join(",")}` : ""}`;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setProducts(data.products ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [items]);

  if (loading || products.length === 0) return null;

  return (
    <section className="py-8">
      <div className="container mx-auto px-4">
        <h2 className="text-xl font-bold">Рекомендоване для вас</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {products.slice(0, 12).map((p) => {
            const wholesalePrice = p.prices.find((pr) => pr.priceType === "wholesale");
            const akciyaPrice = p.prices.find((pr) => pr.priceType === "akciya");
            const displayPrice = akciyaPrice?.amount ?? wholesalePrice?.amount;

            return (
              <Link key={p.id} href={`/product/${p.slug}`}>
                <Card className="group h-full overflow-hidden transition-shadow hover:shadow-md">
                  <div className="aspect-[4/3] bg-gray-100">
                    {p.images[0] ? (
                      <img
                        src={p.images[0].url}
                        alt={p.name}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-gray-400">
                        Немає фото
                      </div>
                    )}
                  </div>
                  <CardContent className="p-2">
                    <h3 className="line-clamp-1 text-xs font-medium">{p.name}</h3>
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      {QUALITY_LABELS[p.quality as QualityLevel] ?? p.quality}
                    </Badge>
                    {displayPrice && (
                      <div className="mt-1 text-xs font-bold">
                        €{displayPrice.toFixed(2)}/{p.priceUnit}
                        {akciyaPrice && wholesalePrice && (
                          <span className="ml-1 text-gray-400 line-through font-normal">
                            €{wholesalePrice.amount.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

### 4. Wire homepage

**`apps/store/app/(store)/page.tsx`** — імпорт + вставка перед `<RecentlyViewedSection />`:

```typescript
import { RecommendationsSection } from "@/components/store/recommendations-section";

// ... у JSX, перед <RecentlyViewedSection />:
<RecommendationsSection />
<RecentlyViewedSection />
```

---

## Verification (worker pre-push)

1. `pnpm format:check` ✅
2. `pnpm -r typecheck` ✅
3. `pnpm -r test` ✅ ≥273 (271 baseline + 2-3 нові)
4. `deploy.ps1` ASCII-only ✅

---

## Out-of-scope

- Web view tracking у DB (skipped — anonymous users не дають значення; mobile-only)
- Customer auth на web (S21 — окрема сесія, велика)
- Personalization beyond category-match
- Cleanup ViewLog (окрема follow-up задача)
- Mobile changes (mobile уже має recommendations через S43)
- Admin "popular products" dashboard

---

## Branch + commit + push

Branch: `claude/session-48-web-recommendations`
Commit: `feat(s48): web recommendations rail on homepage + /api/recommendations endpoint`
Push на feature branch — НЕ мерджити. Orchestrator review-ить.

---

## Deploy notes

Без DB migration. Прямий `deploy.ps1`. Накопичується в чергу разом з S46+S47, deploy за раз коли user вернеться до сервера.
