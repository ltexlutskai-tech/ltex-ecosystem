import { redirect } from "next/navigation";
import { Toaster } from "@ltex/ui";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { ManagerHeader } from "./_components/header";
import { ManagerSidebar } from "./_components/sidebar";

export const metadata = {
  title: "L-TEX Manager",
};

export default async function WorkstationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const lastSyncAt = new Date().toISOString();

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <ManagerHeader
        fullName={user.fullName}
        role={user.role}
        lastSyncAt={lastSyncAt}
      />
      <div className="flex flex-1 overflow-hidden">
        <ManagerSidebar role={user.role} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
