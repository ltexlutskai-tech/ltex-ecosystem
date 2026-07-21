import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

const OFFICE_ROLES = ["bookkeeper", "admin", "owner"];

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  verified: z.boolean(),
});

/**
 * Звірка авто-оплат NovaPay працівником офісу.
 *
 * POST — масово позначити оплати перевіреними (`verified: true`) або зняти
 * позначку (`verified: false`). Зачіпає ЛИШЕ касові ордери з
 * `source = "novapay_auto"` (інші оплати недоторкані).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!OFFICE_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Недостатньо прав" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Оберіть хоча б одну оплату" },
      { status: 400 },
    );
  }

  const { ids, verified } = parsed.data;

  const data = verified
    ? {
        verifiedAt: new Date(),
        verifiedByUserId: user.id,
        verifiedByName: user.fullName,
      }
    : {
        verifiedAt: null,
        verifiedByUserId: null,
        verifiedByName: null,
      };

  const res = await prisma.mgrCashOrder.updateMany({
    where: { id: { in: ids }, source: "novapay_auto" },
    data,
  });

  return NextResponse.json({ ok: true, updated: res.count });
}
