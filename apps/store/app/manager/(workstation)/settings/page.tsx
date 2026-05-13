import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@ltex/db";
import {
  getCurrentUser,
  MANAGER_REFRESH_COOKIE,
} from "@/lib/auth/manager-auth";
import { sha256 } from "@/lib/auth/jwt";
import { ProfileSection } from "./_components/profile-section";
import { TelegramSection } from "./_components/telegram-section";
import { NotifyChannelsSection } from "./_components/notify-channels-section";
import { SessionsSection } from "./_components/sessions-section";
import { LogoutButton } from "./_components/logout-button";

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
      <div className="flex justify-end">
        <LogoutButton />
      </div>
    </div>
  );
}
