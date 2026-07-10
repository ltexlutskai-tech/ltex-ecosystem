import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { listMyPendingDeletions } from "@/lib/manager/deletion-queue";
import { TrashClient } from "./_components/trash-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Кошик | L-TEX Manager",
};

export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { items, total } = await listMyPendingDeletions(user.id, page);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Кошик</h1>
        <p className="mt-1 text-sm text-gray-500">
          Документи, які ви позначили на вилучення. Рухи по регістрах уже
          відкочено (борг/каса/склад оновлено). Поки адміністратор не підтвердив
          остаточне видалення — ви можете повернути документ: він з&apos;явиться
          у списках, а рухи відновляться.
        </p>
      </div>

      <TrashClient items={items} total={total} page={page} />
    </div>
  );
}
