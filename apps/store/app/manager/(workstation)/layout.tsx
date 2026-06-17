import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { ManagerHeader } from "./_components/header";
import { ManagerSidebar } from "./_components/sidebar";
import { WorkstationShell } from "./_components/workstation-shell";

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
    <WorkstationShell
      header={
        <ManagerHeader
          fullName={user.fullName}
          role={user.role}
          lastSyncAt={lastSyncAt}
        />
      }
      sidebar={<ManagerSidebar role={user.role} />}
    >
      {children}
    </WorkstationShell>
  );
}
