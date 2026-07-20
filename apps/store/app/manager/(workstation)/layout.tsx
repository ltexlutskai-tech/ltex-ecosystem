import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { parseUiMode, UI_MODE_COOKIE } from "@/lib/manager/ui-mode";
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

  const cookieStore = await cookies();
  const uiMode = parseUiMode(cookieStore.get(UI_MODE_COOKIE)?.value);

  return (
    <WorkstationShell
      mode={uiMode}
      header={<ManagerHeader fullName={user.fullName} role={user.role} />}
      sidebar={<ManagerSidebar role={user.role} />}
    >
      {children}
    </WorkstationShell>
  );
}
