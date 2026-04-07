import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

interface ProductData {
  articleCode: string;
  code1C: string | null;
  name: string;
  slug: string;
  categorySlug: string;
  subcategorySlug: string;
  quality: string;
  season: string;
  country: string;
  priceUnit: string;
  averageWeight: number | null;
  videoUrl: string | null;
  priceEur: number | null;
  salePriceEur: number | null;
  quantity: number | null;
  inStock: boolean;
}

interface LotData {
  articleCode: string;
  productName: string;
  barcode: string;
  weight: number;
  quantity: number;
  status: string;
  priceEur: number;
  priceUah: number;
  videoUrl: string | null;
  description: string;
  reservedBy: string | null;
  exchangeRate: number;
}

const CATEGORIES = [
  {
    slug: "odyag", name: "Одяг", children: [
      { slug: "futbolky", name: "Футболки" }, { slug: "sorochky", name: "Сорочки" },
      { slug: "svitshoty", name: "Світшоти" }, { slug: "tolstovky", name: "Толстовки" },
      { slug: "svetry", name: "Светри" }, { slug: "kurtky", name: "Куртки" },
      { slug: "palto", name: "Пальто" }, { slug: "zhylety", name: "Жилети" },
      { slug: "dzhinsy", name: "Джинси" }, { slug: "shtany", name: "Штани" },
      { slug: "shorty", name: "Шорти" }, { slug: "sportyvni-shtany", name: "Спортивні штани" },
      { slug: "sukni", name: "Сукні" }, { slug: "spidnytsi", name: "Спідниці" },
      { slug: "bluzy", name: "Блузи" }, { slug: "pizhamy", name: "Піжами" },
      { slug: "bilyzna", name: "Білизна" }, { slug: "kupalniky", name: "Купальники" },
      { slug: "kostyumy", name: "Костюми" }, { slug: "kombinezony", name: "Комбінезони" },
      { slug: "verhniiy-odyag", name: "Верхній одяг" }, { slug: "dytiachyi-odyag", name: "Дитячий одяг" },
      { slug: "inshe-odyag", name: "Інше" },
    ],
  },
  {
    slug: "vzuttia", name: "Взуття", children: [
      { slug: "krosivky", name: "Кросівки" }, { slug: "cherevyky", name: "Черевики" },
      { slug: "choboty", name: "Чоботи" }, { slug: "tufli", name: "Туфлі" },
      { slug: "sandali", name: "Сандалі" }, { slug: "shlopantsi", name: "Шльопанці" },
      { slug: "inshe-vzuttia", name: "Інше" },
    ],
  },
  {
    slug: "aksesuary", name: "Аксесуари", children: [
      { slug: "sumky", name: "Сумки" }, { slug: "remeni", name: "Ремені" },
      { slug: "inshe-aksesuary", name: "Інше" },
    ],
  },
  {
    slug: "dim-ta-pobut", name: "Дім та побут", children: [
      { slug: "postil", name: "Постіль" }, { slug: "shtory", name: "Штори" },
      { slug: "rushnyky", name: "Рушники" }, { slug: "kovdry", name: "Ковдри" },
      { slug: "inshe-dim", name: "Інше" },
    ],
  },
  {
    slug: "igrashky", name: "Іграшки", children: [
      { slug: "miaki", name: "М'які" }, { slug: "plastykovi", name: "Пластикові" },
    ],
  },
  {
    slug: "bric-a-brac", name: "Bric-a-Brac", children: [
      { slug: "miks-bric", name: "Мікс" },
    ],
  },
  {
    slug: "kosmetyka", name: "Косметика", children: [
      { slug: "miks-kosmetyka", name: "Мікс" },
    ],
  },
];

function loadJson<T>(filename: string): T {
  const raw = readFileSync(join(__dirname, "data", filename), "utf-8");
  return JSON.parse(raw) as T;
}

async function main() {
  console.log("🌱 Seeding database...\n");

  // 1. Seed categories
  console.log("📁 Creating categories...");
  const categoryMap = new Map<string, string>(); // slug → id

  for (const cat of CATEGORIES) {
    const parent = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name },
      create: { slug: cat.slug, name: cat.name },
    });
    categoryMap.set(cat.slug, parent.id);

    for (const child of cat.children) {
      const sub = await prisma.category.upsert({
        where: { slug: child.slug },
        update: { name: child.name, parentId: parent.id },
        create: { slug: child.slug, name: child.name, parentId: parent.id },
      });
      categoryMap.set(child.slug, sub.id);
    }
  }
  console.log(`  ✅ ${categoryMap.size} categories created\n`);

  // 2. Seed products
  console.log("📦 Creating products...");
  const productsData = loadJson<ProductData[]>("products.json");
  const productMap = new Map<string, string>(); // articleCode → product.id

  for (const p of productsData) {
    const categoryId = categoryMap.get(p.subcategorySlug) || categoryMap.get(p.categorySlug);
    if (!categoryId) {
      console.warn(`  ⚠️ No category for: ${p.name} (${p.subcategorySlug})`);
      continue;
    }

    const code1C = p.code1C && p.code1C !== "None" ? p.code1C : null;

    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        categoryId,
        quality: p.quality,
        season: p.season,
        priceUnit: p.priceUnit,
        averageWeight: p.averageWeight,
        videoUrl: p.videoUrl,
        inStock: p.inStock,
        articleCode: p.articleCode,
        code1C,
      },
      create: {
        slug: p.slug,
        name: p.name,
        categoryId,
        quality: p.quality,
        season: p.season,
        country: p.country,
        priceUnit: p.priceUnit,
        averageWeight: p.averageWeight,
        videoUrl: p.videoUrl,
        inStock: p.inStock,
        articleCode: p.articleCode,
        code1C,
      },
    });

    productMap.set(p.articleCode, product.id);

    // Create prices
    if (p.priceEur) {
      await prisma.price.upsert({
        where: {
          id: `price-wholesale-${product.id}`,
        },
        update: { amount: p.priceEur },
        create: {
          id: `price-wholesale-${product.id}`,
          productId: product.id,
          priceType: "wholesale",
          currency: "EUR",
          amount: p.priceEur,
        },
      });
    }

    if (p.salePriceEur) {
      await prisma.price.upsert({
        where: {
          id: `price-akciya-${product.id}`,
        },
        update: { amount: p.salePriceEur },
        create: {
          id: `price-akciya-${product.id}`,
          productId: product.id,
          priceType: "akciya",
          currency: "EUR",
          amount: p.salePriceEur,
        },
      });
    }
  }
  console.log(`  ✅ ${productMap.size} products created\n`);

  // 3. Seed lots
  console.log("🏷️  Creating lots...");
  const lotsData = loadJson<LotData[]>("lots.json");
  let lotCount = 0;

  for (const l of lotsData) {
    const productId = productMap.get(l.articleCode);
    if (!productId) {
      // Try to find by matching article code pattern
      continue;
    }

    if (!l.barcode) continue;

    await prisma.lot.upsert({
      where: { barcode: l.barcode },
      update: {
        weight: l.weight,
        quantity: l.quantity,
        status: l.status,
        priceEur: l.priceEur,
        videoUrl: l.videoUrl,
      },
      create: {
        productId,
        barcode: l.barcode,
        weight: l.weight,
        quantity: l.quantity,
        status: l.status,
        priceEur: l.priceEur,
        videoUrl: l.videoUrl,
      },
    });
    lotCount++;
  }
  console.log(`  ✅ ${lotCount} lots created\n`);

  // 4. Seed exchange rate
  console.log("💱 Creating exchange rate...");
  await prisma.exchangeRate.upsert({
    where: {
      currencyFrom_currencyTo_date: {
        currencyFrom: "EUR",
        currencyTo: "UAH",
        date: new Date("2026-03-30"),
      },
    },
    update: { rate: 50.9 },
    create: {
      currencyFrom: "EUR",
      currencyTo: "UAH",
      rate: 50.9,
      date: new Date("2026-03-30"),
      source: "1c",
    },
  });
  console.log("  ✅ EUR/UAH rate: 50.9\n");

  console.log("🎉 Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
