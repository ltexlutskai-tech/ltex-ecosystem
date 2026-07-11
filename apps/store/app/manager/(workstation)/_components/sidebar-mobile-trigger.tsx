"use client";

import { createElement, useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@ltex/ui";
import type { ManagerRole } from "@/lib/auth/jwt";
import { ChatUnreadBadge } from "./chat-unread-badge";
import { DeletionsBadge } from "./deletions-badge";
import { MessengerUnreadBadge } from "./messenger-unread-badge";
import { SidebarNavLink } from "./sidebar-nav-link";
import {
  ADMIN_AUDIT_LINK,
  ADMIN_DELETIONS_LINK,
  ADMIN_PERMISSIONS_LINK,
  ADMIN_REGION_AGENTS_LINK,
  ADMIN_USERS_LINK,
  CHAT_LINK,
  MESSENGER_LINK,
  PRIMARY_LINKS,
  REGISTRY_LINK,
  REPORTS_LINK,
  SECONDARY_LINKS,
  SETTINGS_LINK,
  WAREHOUSE_RECEIVINGS_LINK,
  type SidebarLink,
} from "./sidebar-links";

// Render lucide-react icon inside the client component boundary —
// uses createElement to avoid passing the ComponentType through RSC props.
function iconFor(link: SidebarLink) {
  return createElement(link.icon, { className: "h-4 w-4" });
}

export function SidebarMobileTrigger({ role }: { role: ManagerRole }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

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
          <Section links={PRIMARY_LINKS} onNavigate={close} />
          <Separator />
          <Section links={SECONDARY_LINKS} onNavigate={close} />
          <Separator />
          <SidebarNavLink
            href={CHAT_LINK.href}
            label={CHAT_LINK.label}
            icon={iconFor(CHAT_LINK)}
            badgeSlot={<ChatUnreadBadge />}
            onNavigate={close}
          />
          <SidebarNavLink
            href={MESSENGER_LINK.href}
            label={MESSENGER_LINK.label}
            icon={iconFor(MESSENGER_LINK)}
            badgeSlot={<MessengerUnreadBadge />}
            onNavigate={close}
          />
          {(role === "warehouse" || role === "admin" || role === "owner") && (
            <SidebarNavLink
              href={WAREHOUSE_RECEIVINGS_LINK.href}
              label={WAREHOUSE_RECEIVINGS_LINK.label}
              icon={iconFor(WAREHOUSE_RECEIVINGS_LINK)}
              onNavigate={close}
            />
          )}
          {role !== "warehouse" && role !== "expeditor" && (
            <SidebarNavLink
              href={REGISTRY_LINK.href}
              label={REGISTRY_LINK.label}
              icon={iconFor(REGISTRY_LINK)}
              onNavigate={close}
            />
          )}
          {(role === "analyst" ||
            role === "admin" ||
            role === "owner" ||
            role === "supervisor" ||
            role === "bookkeeper") && (
            <SidebarNavLink
              href={REPORTS_LINK.href}
              label={REPORTS_LINK.label}
              icon={iconFor(REPORTS_LINK)}
              onNavigate={close}
            />
          )}
          <Separator />
          {role === "admin" && (
            <>
              <SidebarNavLink
                href={ADMIN_USERS_LINK.href}
                label={ADMIN_USERS_LINK.label}
                icon={iconFor(ADMIN_USERS_LINK)}
                onNavigate={close}
              />
              <SidebarNavLink
                href={ADMIN_REGION_AGENTS_LINK.href}
                label={ADMIN_REGION_AGENTS_LINK.label}
                icon={iconFor(ADMIN_REGION_AGENTS_LINK)}
                onNavigate={close}
              />
            </>
          )}
          {(role === "admin" || role === "owner") && (
            <>
              <SidebarNavLink
                href={ADMIN_PERMISSIONS_LINK.href}
                label={ADMIN_PERMISSIONS_LINK.label}
                icon={iconFor(ADMIN_PERMISSIONS_LINK)}
                onNavigate={close}
              />
              <SidebarNavLink
                href={ADMIN_AUDIT_LINK.href}
                label={ADMIN_AUDIT_LINK.label}
                icon={iconFor(ADMIN_AUDIT_LINK)}
                onNavigate={close}
              />
              <SidebarNavLink
                href={ADMIN_DELETIONS_LINK.href}
                label={ADMIN_DELETIONS_LINK.label}
                icon={iconFor(ADMIN_DELETIONS_LINK)}
                badgeSlot={<DeletionsBadge />}
                onNavigate={close}
              />
            </>
          )}
          <SidebarNavLink
            href={SETTINGS_LINK.href}
            label={SETTINGS_LINK.label}
            icon={iconFor(SETTINGS_LINK)}
            onNavigate={close}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  links,
  onNavigate,
}: {
  links: readonly SidebarLink[];
  onNavigate: () => void;
}) {
  return (
    <nav className="space-y-1">
      {links.map((link) => (
        <SidebarNavLink
          key={link.href}
          href={link.href}
          label={link.label}
          icon={iconFor(link)}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

function Separator() {
  return <div className="my-2 border-t border-gray-200" />;
}
