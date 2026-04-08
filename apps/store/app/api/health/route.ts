import { NextResponse } from "next/server";
import { prisma } from "@ltex/db";

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      timestamp,
      version: "0.0.0",
      db: "connected",
    });
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        timestamp,
        version: "0.0.0",
        db: "unreachable",
      },
      { status: 503 },
    );
  }
}
