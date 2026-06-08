/**
 * Promote an existing user to role=owner (← Тиждень 1 блоку Ролі).
 *
 * Власник має повний доступ як admin, але всі його дії пишуться у
 * `audit_logs` з `isOwnerAction=true`. Узгоджено з user 2026-06-02:
 * перший власник — kuzenko.t.k@gmail.com.
 *
 * Usage (PowerShell на сервері):
 *   $env:PROMOTE_OWNER_EMAIL = "kuzenko.t.k@gmail.com"
 *   pnpm --filter @ltex/store exec tsx scripts/promote-to-owner.ts
 *
 * Re-running with the same email is a no-op (logs "already owner. Skip").
 * Якщо користувача нема — створіть його через `/manager/admin/users` спершу.
 */
import { prisma } from "@ltex/db";

async function main() {
  const email = process.env.PROMOTE_OWNER_EMAIL?.trim();
  if (!email) {
    console.error("Set PROMOTE_OWNER_EMAIL environment variable.");
    process.exit(1);
  }
  const normalized = email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) {
    console.error(
      `User with email "${normalized}" not found. Create via /manager/admin/users first.`,
    );
    process.exit(1);
  }
  if (user.role === "owner") {
    console.log(`User ${user.email} is already owner. Skip.`);
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { role: "owner" },
  });
  console.log(
    `Promoted ${user.email} (id=${user.id}) from "${user.role}" to "owner".`,
  );
}

main()
  .catch((err) => {
    console.error("Promotion failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
