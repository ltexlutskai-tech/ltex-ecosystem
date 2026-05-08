import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(
    {
      unitsPerKg: { min: 1, max: 1000 },
      unitWeight: { min: 1, max: 1000 },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    },
  );
}
