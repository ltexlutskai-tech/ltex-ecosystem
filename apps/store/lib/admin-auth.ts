import { createClient } from "@/lib/supabase/server";

/**
 * Verify that the current request is from an authenticated admin user.
 * Throws an error if not authenticated — use in server actions.
 */
export async function requireAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized: admin access required");
  }

  return user.id;
}
