import { getCurrentUser } from "@/lib/auth/manager-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ManagerHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">
          Вітаємо, {user.fullName}!
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Робочий стіл L-TEX Manager. Тут згодом з&apos;явиться огляд замовлень,
          клієнтів та синхронізація з 1С.
        </p>
      </div>
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">
          Dashboard буде доданий у наступних сесіях (M1.2+).
        </p>
      </div>
    </div>
  );
}
