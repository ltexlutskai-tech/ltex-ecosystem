import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { InboxClient } from "./_components/inbox-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Чат — L-TEX Manager" };

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  return (
    <div className="relative mx-auto h-full max-w-6xl">
      <header className="mb-3">
        <h1 className="text-2xl font-bold text-gray-800">Чат</h1>
        <p className="mt-1 text-sm text-gray-600">
          Об&apos;єднаний inbox: Telegram, Viber та інші платформи.
        </p>
      </header>
      <InboxClient currentUserId={user.id} currentUserRole={user.role} />
    </div>
  );
}
