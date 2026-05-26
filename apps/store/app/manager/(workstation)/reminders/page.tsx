import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { RemindersClient } from "./_components/reminders-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Нагадування — L-TEX Manager" };

export default async function RemindersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Нагадування</h1>
        <p className="mt-1 text-sm text-gray-600">
          Особистий органайзер: дзвінки, оплати, дії з клієнтами.
        </p>
      </header>
      <RemindersClient currentUserId={user.id} currentUserRole={user.role} />
    </div>
  );
}
