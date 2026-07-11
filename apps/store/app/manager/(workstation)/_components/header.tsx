import Link from "next/link";
import type { ManagerRole } from "@/lib/auth/jwt";
import { HeaderBarcode } from "./header-barcode";
import { HeaderMessengerBell } from "./header-messenger-bell";
import { HeaderNotificationsBell } from "./header-notifications-bell";
import { HeaderProfileMenu } from "./header-profile-menu";
import { HeaderSearch } from "./header-search";
import { SidebarMobileTrigger } from "./sidebar-mobile-trigger";

export function ManagerHeader({
  fullName,
  role,
}: {
  fullName: string;
  role: ManagerRole;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-white px-3 lg:px-6">
      <SidebarMobileTrigger role={role} />
      <Link
        href="/manager"
        className="text-lg font-bold text-green-700 whitespace-nowrap"
      >
        L-TEX Manager
      </Link>
      <div className="flex flex-1 items-center gap-2 lg:ml-4 lg:max-w-2xl">
        <HeaderSearch />
        <HeaderBarcode />
      </div>
      <HeaderMessengerBell />
      <HeaderNotificationsBell />
      <HeaderProfileMenu fullName={fullName} role={role} />
    </header>
  );
}
