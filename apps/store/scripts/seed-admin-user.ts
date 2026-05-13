/**
 * Seed the first manager admin user.
 *
 * Usage (PowerShell):
 *   $env:SEED_ADMIN_EMAIL = "ltex.lutsk.ai@gmail.com"
 *   $env:SEED_ADMIN_PASSWORD = "<12+ chars>"
 *   $env:SEED_ADMIN_NAME = "Адміністратор L-TEX"
 *   pnpm --filter @ltex/store exec tsx scripts/seed-admin-user.ts
 *
 * Re-running with the same email is a no-op (logs "already exists. Skip").
 * Delete the env vars after the first successful run.
 */
import { prisma } from "@ltex/db";
import { hashPassword } from "@/lib/auth/password";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() ?? "Адміністратор L-TEX";

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
    console.log(`User ${normalized} already exists. Skip.`);
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
