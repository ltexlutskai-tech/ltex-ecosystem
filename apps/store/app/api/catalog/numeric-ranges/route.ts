import { NextResponse } from "next/server";
import { prisma } from "@ltex/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await prisma.product.aggregate({
    where: { inStock: true },
    _min: { unitsPerKgMin: true, unitWeightMin: true },
    _max: { unitsPerKgMax: true, unitWeightMax: true },
  });

  const unitsMin =
    result._min.unitsPerKgMin != null
      ? Math.floor(Number(result._min.unitsPerKgMin))
      : 0;
  const unitsMax =
    result._max.unitsPerKgMax != null
      ? Math.ceil(Number(result._max.unitsPerKgMax))
      : 20;

  const weightMin =
    result._min.unitWeightMin != null
      ? Math.floor(Number(result._min.unitWeightMin) * 100) / 100
      : 0;
  const weightMax =
    result._max.unitWeightMax != null
      ? Math.ceil(Number(result._max.unitWeightMax) * 100) / 100
      : 5;

  return NextResponse.json(
    {
      unitsPerKg: { min: unitsMin, max: unitsMax },
      unitWeight: { min: weightMin, max: weightMax },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    },
  );
}
