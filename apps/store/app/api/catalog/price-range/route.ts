import { NextResponse } from "next/server";
import { prisma } from "@ltex/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await prisma.price.aggregate({
    where: { priceType: "wholesale" },
    _min: { amount: true },
    _max: { amount: true },
  });
  const min = result._min.amount;
  const max = result._max.amount;
  return NextResponse.json(
    {
      min: min !== null && min !== undefined ? Math.floor(Number(min)) : 0,
      max: max !== null && max !== undefined ? Math.ceil(Number(max)) : 100,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    },
  );
}
