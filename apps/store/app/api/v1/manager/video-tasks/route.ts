import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { createVideoTaskSchema } from "@/lib/validations/video-task";
import { createVideoTask } from "@/lib/manager/video-task";

/**
 * POST /api/v1/manager/video-tasks
 *
 * Менеджер замовляє відеоогляд товару для клієнта (з Прайсу / картки лоту /
 * картки клієнта). Створює завдання (`new`) → склад бачить його як «принести
 * мішок», відеозона — після принесення мішка. Гейт: ролі, що ведуть продажі.
 */

const CREATE_ROLES = [
  "manager",
  "senior_manager",
  "admin",
  "owner",
  "supervisor",
  "analyst",
];

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!CREATE_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createVideoTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  try {
    const task = await createVideoTask({
      productId: parsed.data.productId,
      clientId: parsed.data.clientId,
      quantity: parsed.data.quantity,
      requestedBarcode: parsed.data.requestedBarcode ?? null,
      manager: { id: user.id, fullName: user.fullName },
    });
    return NextResponse.json({ id: task.id }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "PRODUCT_NOT_FOUND") {
      return NextResponse.json({ error: "Товар не знайдено" }, { status: 404 });
    }
    if (msg === "CLIENT_NOT_FOUND") {
      return NextResponse.json(
        { error: "Клієнта не знайдено" },
        { status: 404 },
      );
    }
    console.error("[L-TEX] create video task failed", { error: msg });
    return NextResponse.json(
      { error: "Не вдалося створити завдання" },
      { status: 500 },
    );
  }
}
