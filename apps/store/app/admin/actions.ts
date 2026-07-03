"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  MANAGER_ACCESS_COOKIE,
  MANAGER_REFRESH_COOKIE,
} from "@/lib/auth/manager-auth";

export async function signOut() {
  // Clear the manager JWT session cookies (session 6.1 — admin auth moved off
  // Supabase onto our own users table). The short-lived access token expires
  // in 15 min anyway; clearing the cookies drops the session immediately.
  const store = await cookies();
  store.set(MANAGER_ACCESS_COOKIE, "", { maxAge: 0, path: "/" });
  store.set(MANAGER_REFRESH_COOKIE, "", {
    maxAge: 0,
    path: "/api/v1/manager/auth",
  });
  redirect("/admin/login");
}
