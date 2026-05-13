import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { updateRatesSchema } from "@/lib/validations/manager-rates";

function startOfUtcDay(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export async function POST(req: NextRequest) {
  const admin = await requireRole(["admin"], req);
  if (!admin) {
    return NextResponse.json({ error: "Недостатньо прав" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateRatesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const today = startOfUtcDay();
  const { EUR, USD } = parsed.data;

  const [eurRow, usdRow] = await prisma.$transaction([
    prisma.exchangeRate.upsert({
      where: {
        currencyFrom_currencyTo_date: {
          currencyFrom: "EUR",
          currencyTo: "UAH",
          date: today,
        },
      },
      update: { rate: EUR, source: "manual" },
      create: {
        currencyFrom: "EUR",
        currencyTo: "UAH",
        date: today,
        rate: EUR,
        source: "manual",
      },
    }),
    prisma.exchangeRate.upsert({
      where: {
        currencyFrom_currencyTo_date: {
          currencyFrom: "USD",
          currencyTo: "UAH",
          date: today,
        },
      },
      update: { rate: USD, source: "manual" },
      create: {
        currencyFrom: "USD",
        currencyTo: "UAH",
        date: today,
        rate: USD,
        source: "manual",
      },
    }),
  ]);

  // TODO M1.3+ — sync назад у 1С через MobileExchange.1cws::ЗаписатиКурсВалют

  return NextResponse.json({
    rates: {
      EUR: eurRow.rate,
      USD: usdRow.rate,
      date: today.toISOString(),
    },
  });
}
