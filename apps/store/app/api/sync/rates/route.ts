import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.SYNC_API_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rates: Array<{
    currencyFrom: string;
    currencyTo: string;
    rate: number;
    date?: string;
    source?: string;
  }> = await request.json();

  let upserted = 0;
  let errors = 0;

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
        update: {
          rate: r.rate,
          source: r.source ?? "1c",
        },
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
    } catch {
      errors++;
    }
  }

  return NextResponse.json({ upserted, errors, total: rates.length });
}
