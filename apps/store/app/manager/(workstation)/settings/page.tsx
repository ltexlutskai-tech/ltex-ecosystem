import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@ltex/db";
import {
  getCurrentUser,
  MANAGER_REFRESH_COOKIE,
} from "@/lib/auth/manager-auth";
import { sha256 } from "@/lib/auth/jwt";
import { getRepackWeightTolerance } from "@/lib/manager/mgr-settings";
import { parseUiMode, UI_MODE_COOKIE } from "@/lib/manager/ui-mode";
import { ProfileSection } from "./_components/profile-section";
import { UiModeSection } from "./_components/ui-mode-section";
import { TelegramSection } from "./_components/telegram-section";
import { NotifyChannelsSection } from "./_components/notify-channels-section";
import { SessionsSection } from "./_components/sessions-section";
import { RepackToleranceSection } from "./_components/repack-tolerance-section";
import { LogoutButton } from "./_components/logout-button";

const REPACK_EDIT_ROLES = ["warehouse", "admin", "owner"];
// Блоки «Активні сесії» та «Перепаковка» — лише власнику/адміну (ТЗ 2026-07-18):
// менеджеру вони не потрібні.
const OWNER_SETTINGS_ROLES = ["admin", "owner"];

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

  const showOwnerSettings = OWNER_SETTINGS_ROLES.includes(user.role);
  const repackTolerance = showOwnerSettings
    ? await getRepackWeightTolerance()
    : 0;
  const uiMode = parseUiMode(cookieStore.get(UI_MODE_COOKIE)?.value);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Налаштування</h1>
      <UiModeSection initialMode={uiMode} />
      <ProfileSection email={user.email} fullName={user.fullName} />
      <TelegramSection telegramLinked={user.telegramLinked} />
      <NotifyChannelsSection
        initialChannels={user.notifyChannels}
        telegramLinked={user.telegramLinked}
      />
      {showOwnerSettings && (
        <>
          <SessionsSection sessions={sessions} />
          <RepackToleranceSection
            initial={repackTolerance}
            canEdit={REPACK_EDIT_ROLES.includes(user.role)}
          />
        </>
      )}
      {/* Довідники (банк-рахунки / статті ДДС / посилання відеоопису) переїхали
          у «Довідники та регістри» → секція «Довідники» (рішення user). */}
      <div className="flex justify-end">
        <LogoutButton />
      </div>
    </div>
  );
}
