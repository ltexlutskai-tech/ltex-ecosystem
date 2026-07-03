/**
 * Seed (or reset) the manager admin user used for /admin/* login.
 *
 * Create the first admin (PowerShell):
 *   $env:SEED_ADMIN_EMAIL = "ltex.lutsk.ai@gmail.com"
 *   $env:SEED_ADMIN_PASSWORD = "<12+ chars>"
 *   $env:SEED_ADMIN_NAME = "Адміністратор L-TEX"
 *   pnpm --filter @ltex/store exec tsx scripts/seed-admin-user.ts
 *
 * By default re-running with an existing email is a no-op (logs "Skip").
 *
 * Reset an existing user's password / re-enable it (session 6.1 — needed after
 * moving admin auth off Supabase onto our own users table):
 *   $env:SEED_ADMIN_EMAIL = "ltex.lutsk.ai@gmail.com"
 *   $env:SEED_ADMIN_PASSWORD = "<NEW 12+ chars>"
 *   $env:SEED_ADMIN_RESET = "1"
 *   pnpm --filter @ltex/store exec tsx scripts/seed-admin-user.ts
 * With SEED_ADMIN_RESET set, the existing user's passwordHash is updated,
 * isActive is forced true, and the role is promoted to `owner` if it is not
 * already an admin role ({admin, owner}).
 *
 * Delete the env vars after a successful run.
 */
import { prisma } from "@ltex/db";
import { hashPassword } from "@/lib/auth/password";

const ADMIN_ROLES = new Set(["admin", "owner"]);

function isTruthy(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() ?? "Адміністратор L-TEX";
  const reset = isTruthy(process.env.SEED_ADMIN_RESET);

  if (!email || !password) {
    console.error(
      "Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD environment variables.",
    );
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("SEED_ADMIN_PASSWORD must be at least 12 characters long.");
    process.exit(1);
  }

  const normalized = email.toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email: normalized },
  });

  if (existing) {
    if (!reset) {
      console.log(
        `User ${normalized} already exists. Skip (set SEED_ADMIN_RESET=1 to reset password).`,
      );
      return;
    }
    const passwordHash = await hashPassword(password);
    const nextRole = ADMIN_ROLES.has(existing.role) ? existing.role : "owner";
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, isActive: true, role: nextRole },
      select: { id: true, email: true, role: true },
    });
    console.log(
      `Reset admin user ${updated.email} (id=${updated.id}, role=${updated.role}). Password updated, isActive=true.`,
    );
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: normalized,
      passwordHash,
      fullName: name,
      role: "admin",
      isActive: true,
    },
    select: { id: true, email: true },
  });
  console.log(`Created admin user ${user.email} (id=${user.id}).`);
}

main()
  .catch((err) => {
    console.error("seed-admin-user failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
