import Link from "next/link";
import type { ManagerRole } from "@/lib/auth/jwt";
import { HeaderBarcode } from "./header-barcode";
import { HeaderNotificationsBell } from "./header-notifications-bell";
import { HeaderProfileMenu } from "./header-profile-menu";
import { HeaderSearch } from "./header-search";
import { HeaderSyncIndicator } from "./header-sync-indicator";
import { SidebarMobileTrigger } from "./sidebar-mobile-trigger";

export function ManagerHeader({
  fullName,
  role,
  chatUnread = 0,
  lastSyncAt,
}: {
  fullName: string;
  role: ManagerRole;
  chatUnread?: number;
  lastSyncAt: string | null;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-white px-3 lg:px-6">
      <SidebarMobileTrigger role={role} chatUnread={chatUnread} />
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
      <HeaderSyncIndicator initialLastSyncAt={lastSyncAt} />
      <HeaderNotificationsBell />
      <HeaderProfileMenu fullName={fullName} role={role} />
    </header>
  );
}
