import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { createSiteLead } from "@/lib/manager/site-lead";
import { notifyNewLead } from "@/lib/notifications";
import { getRegionLabel, isValidRegionSlug } from "@/lib/constants/regions";

/**
 * POST /api/price-list-request — форма «Отримати прайс лист» (сайт, Stage 2
 * Відеозони: посилання з YouTube-опису веде сюди).
 *
 * Створює лід (`MgrLead`) з маршрутизацією на менеджера за областю
 * (`MgrRegionAgent`) — той самий механізм, що й реєстрація кабінету. Дедуп по
 * телефону всередині `createSiteLead` (наявний клієнт/активний лід → тихо ок).
 * Сповіщення адмінам у Telegram — best-effort.
 */

const schema = z.object({
  name: z.string().trim().min(2, "Вкажіть імʼя").max(120),
  phone: z
    .string()
    .trim()
    .min(9, "Вкажіть телефон")
    .max(20)
    .regex(/^[+\d\s\-()]+$/, "Невірний формат телефону"),
  region: z.string().refine(isValidRegionSlug, "Оберіть область"),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limited = rateLimit(`price-list:${ip}`, { max: 3, windowMs: 60_000 });
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Забагато запитів — спробуйте за хвилину" },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Невірні дані" },
      { status: 400 },
    );
  }

  const { name, phone, region } = parsed.data;

  await createSiteLead({ name, phone, regionSlug: region });

  // Best-effort сповіщення (та сама група, що й нові ліди реєстрації).
  void notifyNewLead({
    customerId: "price-list-form",
    phone,
    name,
    city: getRegionLabel(region),
    source: "web",
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
