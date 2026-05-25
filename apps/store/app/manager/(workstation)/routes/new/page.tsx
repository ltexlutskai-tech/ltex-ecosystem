import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Новий маршрутний лист — L-TEX Manager" };

/**
 * Створення маршрутного листа: створюємо чернетку на сервері та одразу
 * редіректимо на детальну сторінку `[id]`, де менеджер заповнює шапку
 * (Маршрут/Експедитор/…) та вкладки. Документ автозберігається (як 1С —
 * «майже кожна дія викликає ЗаписатьПриИзменении»).
 */
export default async function NewRouteSheetPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sheet = await prisma.routeSheet.create({
    data: { status: "draft", createdByUserId: user.id },
    select: { id: true },
  });

  redirect(`/manager/routes/${sheet.id}`);
}
