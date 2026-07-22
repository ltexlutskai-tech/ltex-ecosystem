import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { MessengerClient } from "./_components/messenger-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Чат LTEX — L-TEX Manager" };

export default async function MessengerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  return (
    <div className="relative mx-auto h-full max-w-6xl">
      <header className="mb-3">
        <h1 className="text-2xl font-bold text-gray-800">Чат LTEX</h1>
        <p className="mt-1 text-sm text-gray-600">
          Внутрішнє спілкування співробітників L-TEX.
        </p>
      </header>
      <MessengerClient
        currentUserId={user.id}
        currentUserRole={user.role}
        currentUserName={user.fullName}
      />
    </div>
  );
}
