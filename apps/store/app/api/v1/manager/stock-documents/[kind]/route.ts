import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { isStockDocKind, parseCreateBody, listStockDocs } from "@/lib/manager/stock-documents-api";
import { createStockDoc } from "@/lib/manager/stock-documents-repo";

/** GET/POST /api/v1/manager/stock-documents/[kind] — список / створити draft. */

const WRITE_ROLES = ["manager", "admin", "owner", "warehouse"] as const;
const READ_ROLES = ["manager", "senior_manager", "supervisor", "admin", "owner", "warehouse", "analyst", "bookkeeper", "expeditor"] as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isStockDocKind(kind)) return NextResponse.json({ error: "Невідомий тип" }, { status: 404 });
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  if (!(READ_ROLES as readonly string[]).includes(user.role)) return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  const url = new URL(req.url);
  const result = await listStockDocs(kind, { status: url.searchParams.get("status") ?? undefined, q: url.searchParams.get("q") ?? undefined, page: Number(url.searchParams.get("page") ?? "1") });
  return NextResponse.json(result);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isStockDocKind(kind)) return NextResponse.json({ error: "Невідомий тип" }, { status: 404 });
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  if (!(WRITE_ROLES as readonly string[]).includes(user.role)) return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const parsed = parseCreateBody(kind, body, user.id);
  if (!parsed.ok) return NextResponse.json({ error: "Невірні дані", issues: parsed.issues }, { status: 400 });
  const created = await createStockDoc(kind, parsed.data);
  return NextResponse.json(created, { status: 201 });
}
