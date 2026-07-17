import { Fragment, type ReactNode } from "react";
import type { ManagerRole } from "@/lib/auth/jwt";
import { ChatUnreadBadge } from "./chat-unread-badge";
import { DeletionsBadge } from "./deletions-badge";
import { MessengerUnreadBadge } from "./messenger-unread-badge";
import { PendingBadge } from "./pending-badge";
import { WarehouseTasksBadge } from "./warehouse-tasks-badge";
import { SidebarNavLink } from "./sidebar-nav-link";
import {
  getSidebarSections,
  renderLinkIcon,
  type SidebarBadge,
  type SidebarItem,
} from "./sidebar-links";

/** Мапить ключ бейджа у ноду-лічильник (client-компоненти з полінгом). */
function badgeNode(badge: SidebarBadge | undefined): ReactNode {
  switch (badge) {
    case "orders-pending":
      return <PendingBadge kind="orders" />;
    case "sales-pending":
      return <PendingBadge kind="sales" />;
    case "chat":
      return <ChatUnreadBadge />;
    case "messenger":
      return <MessengerUnreadBadge />;
    case "warehouse-tasks":
      return <WarehouseTasksBadge />;
    case "deletions":
      return <DeletionsBadge />;
    default:
      return undefined;
  }
}

export function ManagerSidebar({ role }: { role: ManagerRole }) {
  const sections = getSidebarSections(role);
  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-white p-3 lg:flex">
      {sections.map((section, i) => (
        <Fragment key={i}>
          {i > 0 && <Separator />}
          <nav className="space-y-1">
            {section.map((link) => (
              <NavLink key={link.href} link={link} />
            ))}
          </nav>
        </Fragment>
      ))}
    </aside>
  );
}

function NavLink({ link }: { link: SidebarItem }) {
  return (
    <SidebarNavLink
      href={link.href}
      label={link.label}
      icon={renderLinkIcon(link)}
      badgeSlot={badgeNode(link.badge)}
    />
  );
}

function Separator() {
  return <div className="my-2 border-t border-gray-200" />;
}
