import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { z } from "zod";

const rateSchema = z.object({
  currencyFrom: z.enum(["EUR", "UAH", "USD"]),
  currencyTo: z.enum(["EUR", "UAH", "USD"]),
  rate: z.number().positive(),
  date: z.string().datetime().optional(),
  source: z.string().optional(),
});

const syncRatesSchema = z.array(rateSchema);

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.SYNC_API_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = syncRatesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const rates = parsed.data;
  let upserted = 0;
  const errors: string[] = [];

  for (const r of rates) {
    try {
      const date = r.date ? new Date(r.date) : new Date();

      await prisma.exchangeRate.upsert({
        where: {
          currencyFrom_currencyTo_date: {
            currencyFrom: r.currencyFrom,
            currencyTo: r.currencyTo,
            date,
          },
        },
        update: { rate: r.rate, source: r.source ?? "1c" },
        create: {
          currencyFrom: r.currencyFrom,
          currencyTo: r.currencyTo,
          rate: r.rate,
          date,
          source: r.source ?? "1c",
        },
      });
      upserted++;

      await prisma.syncLog.create({
        data: {
          entity: "exchange_rate",
          entityId: `${r.currencyFrom}_${r.currencyTo}`,
          action: "upsert",
          payload: JSON.parse(JSON.stringify(r)),
        },
      });
    } catch (err) {
      errors.push(
        `Failed: ${r.currencyFrom}→${r.currencyTo} — ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  return NextResponse.json({
    upserted,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
    total: rates.length,
  });
}
