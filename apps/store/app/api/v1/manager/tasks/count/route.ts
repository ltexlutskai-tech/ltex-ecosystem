import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { countOpenAssignedTasks } from "@/lib/manager/tasks";

/** Лічильник відкритих завдань «на мене» (для бейджа в меню). */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ total: 0 });
  const total = await countOpenAssignedTasks(user);
  return NextResponse.json({ total });
}
