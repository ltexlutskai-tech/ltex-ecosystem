"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  MANAGER_ACCESS_COOKIE,
  MANAGER_REFRESH_COOKIE,
  MANAGER_COOKIE_PATH,
} from "@/lib/auth/manager-auth";

export async function signOut() {
  // Clear the manager JWT session cookies (session 6.1 — admin auth moved off
  // Supabase onto our own users table). Both cookies live on path "/", so the
  // refresh cookie must be cleared there too — otherwise the middleware would
  // silently mint a fresh access token and re-log the admin back in.
  const store = await cookies();
  store.set(MANAGER_ACCESS_COOKIE, "", {
    maxAge: 0,
    path: MANAGER_COOKIE_PATH,
  });
  store.set(MANAGER_REFRESH_COOKIE, "", {
    maxAge: 0,
    path: MANAGER_COOKIE_PATH,
  });
  redirect("/admin/login");
}
