"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ManagerRole } from "@/lib/auth/jwt";
import { ChatUnreadBadge } from "./chat-unread-badge";
import { DeletionsBadge } from "./deletions-badge";
import { MessengerUnreadBadge } from "./messenger-unread-badge";
import { PendingBadge } from "./pending-badge";
import { RemindersBadge } from "./reminders-badge";
import { TasksBadge } from "./tasks-badge";
import { VideoTasksBadge } from "./video-tasks-badge";
import { WarehouseTasksBadge } from "./warehouse-tasks-badge";
import { SidebarNavLink } from "./sidebar-nav-link";
import {
  getSidebarSections,
  renderLinkIcon,
  type SidebarBadge,
  type SidebarItem,
} from "./sidebar-links";

const LS_KEY = "ltex:sidebar-collapsed";

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
    case "tasks":
      return <TasksBadge />;
    case "warehouse-tasks":
      return <WarehouseTasksBadge />;
    case "video-tasks":
      return <VideoTasksBadge />;
    case "reminders":
      return <RemindersBadge />;
    case "deletions":
      return <DeletionsBadge />;
    default:
      return undefined;
  }
}

export function ManagerSidebar({ role }: { role: ManagerRole }) {
  const sections = getSidebarSections(role);
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(LS_KEY) === "1");
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(LS_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // Розгорнутий вигляд: коли не згорнуто АБО коли згорнуто, але наведено (overlay).
  const expanded = !collapsed || hovered;

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative hidden shrink-0 border-r transition-[width] duration-150 lg:block ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Внутрішня панель: у згорнутому+наведеному стані «випливає» поверх
          контенту (overlay), не зсуваючи робочу область. */}
      <div
        className={`flex h-full flex-col gap-1 overflow-x-hidden overflow-y-auto bg-white p-3 ${
          collapsed && hovered
            ? "absolute inset-y-0 left-0 z-40 w-60 shadow-xl"
            : "w-full"
        }`}
      >
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Розгорнути меню" : "Згорнути меню"}
          className={`mb-1 flex items-center rounded-md py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 ${
            expanded ? "justify-end px-3" : "justify-center px-2"
          }`}
        >
          {collapsed && !hovered ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>

        {sections.map((section, i) => (
          <Fragment key={i}>
            {i > 0 && <Separator />}
            <nav className="space-y-1">
              {section.map((link) => (
                <NavLink key={link.href} link={link} collapsed={!expanded} />
              ))}
            </nav>
          </Fragment>
        ))}
      </div>
    </aside>
  );
}

function NavLink({
  link,
  collapsed,
}: {
  link: SidebarItem;
  collapsed: boolean;
}) {
  return (
    <SidebarNavLink
      href={link.href}
      label={link.label}
      icon={renderLinkIcon(link)}
      badgeSlot={badgeNode(link.badge)}
      collapsed={collapsed}
    />
  );
}

function Separator() {
  return <div className="my-2 border-t border-gray-200" />;
}
