import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { buildScanSheetPrintUrl } from "@/lib/delivery/nova-poshta";

const WAREHOUSE_ROLES = ["warehouse", "admin", "owner"];
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * GET /api/v1/manager/np-registers/[ref]/print
 *
 * Стрімить PDF реєстру відправлень НП. URL містить apiKey у шляху, тому
 * тягнемо PDF на СЕРВЕРІ (ключ прихований) і віддаємо байти браузеру складу.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!WAREHOUSE_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Недостатньо прав" }, { status: 403 });
  }

  const { ref } = await params;
  const url = buildScanSheetPrintUrl(ref);
  if (!url) {
    return NextResponse.json(
      { error: "NOVA_POSHTA_API_KEY не налаштовано" },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return NextResponse.json(
        { error: `НП друк HTTP ${res.status}` },
        { status: 502 },
      );
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return NextResponse.json(
        { error: "НП не повернув PDF реєстру" },
        { status: 502 },
      );
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="register-${ref}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
