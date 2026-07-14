import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Landmark, ListTree } from "lucide-react";
import { prisma } from "@ltex/db";
import {
  getCurrentUser,
  MANAGER_REFRESH_COOKIE,
} from "@/lib/auth/manager-auth";
import { sha256 } from "@/lib/auth/jwt";
import { getRepackWeightTolerance } from "@/lib/manager/mgr-settings";
import { ProfileSection } from "./_components/profile-section";
import { TelegramSection } from "./_components/telegram-section";
import { NotifyChannelsSection } from "./_components/notify-channels-section";
import { SessionsSection } from "./_components/sessions-section";
import { RepackToleranceSection } from "./_components/repack-tolerance-section";
import { LogoutButton } from "./_components/logout-button";

const REPACK_EDIT_ROLES = ["warehouse", "admin", "owner"];

export const dynamic = "force-dynamic";
export const metadata = { title: "Налаштування — L-TEX Manager" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const cookieStore = await cookies();
  const refreshPlain = cookieStore.get(MANAGER_REFRESH_COOKIE)?.value ?? null;
  const currentHash = refreshPlain ? sha256(refreshPlain) : null;

  const sessionsRaw = await prisma.userRefreshToken.findMany({
    where: {
      userId: user.id,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      tokenHash: true,
    },
  });

  const sessions = sessionsRaw.map((s) => ({
    id: s.id,
    userAgent: s.userAgent,
    ipAddress: s.ipAddress,
    createdAt: s.createdAt,
    isCurrent: currentHash !== null && s.tokenHash === currentHash,
  }));

  const repackTolerance = await getRepackWeightTolerance();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Налаштування</h1>
      <ProfileSection email={user.email} fullName={user.fullName} />
      <TelegramSection telegramLinked={user.telegramLinked} />
      <NotifyChannelsSection
        initialChannels={user.notifyChannels}
        telegramLinked={user.telegramLinked}
      />
      <SessionsSection sessions={sessions} />
      <RepackToleranceSection
        initial={repackTolerance}
        canEdit={REPACK_EDIT_ROLES.includes(user.role)}
      />
      {(user.role === "admin" || user.role === "owner") && (
        <section className="rounded-lg border bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-700">Довідники</h2>
          <p className="mt-1 text-xs text-gray-500">
            Керування довідниками каси. У «Банківські рахунки» також задаються
            реквізити для «Скинути реквізити» (одержувач/IBAN/ЄДРПОУ).
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Link
              href="/manager/bank-accounts"
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Landmark className="h-4 w-4 text-green-600" />
              Банківські рахунки
            </Link>
            <Link
              href="/manager/cash-flow-articles"
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <ListTree className="h-4 w-4 text-green-600" />
              Статті руху коштів
            </Link>
          </div>
        </section>
      )}
      <div className="flex justify-end">
        <LogoutButton />
      </div>
    </div>
  );
}
