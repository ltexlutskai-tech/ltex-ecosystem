import { getCurrentUser } from "@/lib/auth/manager-auth";
import { ADMIN_ROLES } from "@/lib/auth/jwt";

/**
 * Verify that the current request is from an authenticated admin user.
 *
 * Authenticates against our own `users` table via the manager JWT cookie
 * (`ltex_mgr_access`) — Supabase Auth is no longer involved (session 6.1).
 * Only roles in ADMIN_ROLES ({admin, owner}) are allowed.
 *
 * Throws when there is no valid session or the role is not an admin role —
 * use in server actions / admin API routes. Returns the user id.
 */
export async function requireAdmin(): Promise<string> {
  const user = await getCurrentUser();

  if (!user || !ADMIN_ROLES.has(user.role)) {
    throw new Error("Unauthorized: admin access required");
  }

  return user.id;
}
