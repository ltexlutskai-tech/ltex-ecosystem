import type { ManagerRole } from "@/lib/auth/jwt";
import { SidebarNavLink } from "./sidebar-nav-link";
import {
  ADMIN_USERS_LINK,
  CHAT_LINK,
  PRIMARY_LINKS,
  SECONDARY_LINKS,
  SETTINGS_LINK,
  renderLinkIcon,
  type SidebarLink,
} from "./sidebar-links";

export function ManagerSidebar({
  role,
  chatUnread = 0,
}: {
  role: ManagerRole;
  chatUnread?: number;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-white p-3 lg:flex">
      <NavSection links={PRIMARY_LINKS} />
      <Separator />
      <NavSection links={SECONDARY_LINKS} />
      <Separator />
      <SidebarNavLink
        href={CHAT_LINK.href}
        label={CHAT_LINK.label}
        icon={renderLinkIcon(CHAT_LINK)}
        badge={chatUnread}
      />
      <Separator />
      {role === "admin" && (
        <SidebarNavLink
          href={ADMIN_USERS_LINK.href}
          label={ADMIN_USERS_LINK.label}
          icon={renderLinkIcon(ADMIN_USERS_LINK)}
        />
      )}
      <SidebarNavLink
        href={SETTINGS_LINK.href}
        label={SETTINGS_LINK.label}
        icon={renderLinkIcon(SETTINGS_LINK)}
      />
    </aside>
  );
}

function NavSection({ links }: { links: readonly SidebarLink[] }) {
  return (
    <nav className="space-y-1">
      {links.map((link) => (
        <SidebarNavLink
          key={link.href}
          href={link.href}
          label={link.label}
          icon={renderLinkIcon(link)}
        />
      ))}
    </nav>
  );
}

function Separator() {
  return <div className="my-2 border-t border-gray-200" />;
}
