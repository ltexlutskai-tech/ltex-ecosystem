"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@ltex/ui";
import type { ManagerRole } from "@/lib/auth/jwt";
import { SidebarNavLink } from "./sidebar-nav-link";
import {
  ADMIN_USERS_LINK,
  CHAT_LINK,
  PRIMARY_LINKS,
  SECONDARY_LINKS,
  SETTINGS_LINK,
  type SidebarLink,
} from "./sidebar-links";

export function SidebarMobileTrigger({
  role,
  chatUnread = 0,
}: {
  role: ManagerRole;
  chatUnread?: number;
}) {
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
            {...CHAT_LINK}
            badge={chatUnread}
            onNavigate={close}
          />
          <Separator />
          {role === "admin" && (
            <SidebarNavLink {...ADMIN_USERS_LINK} onNavigate={close} />
          )}
          <SidebarNavLink {...SETTINGS_LINK} onNavigate={close} />
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
        <SidebarNavLink key={link.href} {...link} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

function Separator() {
  return <div className="my-2 border-t border-gray-200" />;
}
