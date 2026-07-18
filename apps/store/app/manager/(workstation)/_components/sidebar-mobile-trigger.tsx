"use client";

import { createElement, Fragment, useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@ltex/ui";
import type { ManagerRole } from "@/lib/auth/jwt";
import { ChatUnreadBadge } from "./chat-unread-badge";
import { DeletionsBadge } from "./deletions-badge";
import { MessengerUnreadBadge } from "./messenger-unread-badge";
import { PendingBadge } from "./pending-badge";
import { TasksBadge } from "./tasks-badge";
import { WarehouseTasksBadge } from "./warehouse-tasks-badge";
import { SidebarNavLink } from "./sidebar-nav-link";
import {
  getSidebarSections,
  type SidebarBadge,
  type SidebarItem,
} from "./sidebar-links";

// Render lucide-react icon inside the client component boundary —
// uses createElement to avoid passing the ComponentType through RSC props.
function iconFor(link: SidebarItem) {
  return createElement(link.icon, { className: "h-4 w-4" });
}

/** Мапить ключ бейджа у ноду-лічильник (той самий набір, що на десктопі). */
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
    case "tasks":
      return <TasksBadge />;
    case "warehouse-tasks":
      return <WarehouseTasksBadge />;
    case "deletions":
      return <DeletionsBadge />;
    default:
      return undefined;
  }
}

export function SidebarMobileTrigger({ role }: { role: ManagerRole }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const sections = getSidebarSections(role);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        aria-label="Меню"
        onClick={() => setOpen(true)}
        className="rounded-md p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <SheetContent side="left" className="w-72 overflow-y-auto p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-base text-green-700">
            L-TEX Manager
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-1 p-3">
          {sections.map((section, i) => (
            <Fragment key={i}>
              {i > 0 && <Separator />}
              <nav className="space-y-1">
                {section.map((link) => (
                  <SidebarNavLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    icon={iconFor(link)}
                    badgeSlot={badgeNode(link.badge)}
                    onNavigate={close}
                  />
                ))}
              </nav>
            </Fragment>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Separator() {
  return <div className="my-2 border-t border-gray-200" />;
}
