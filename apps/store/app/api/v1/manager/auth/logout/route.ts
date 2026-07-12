import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { sha256 } from "@/lib/auth/jwt";
import {
  MANAGER_REFRESH_COOKIE,
  clearManagerAuthCookies,
  getCurrentUser,
} from "@/lib/auth/manager-auth";

export async function POST(req: NextRequest) {
  const everywhere = req.nextUrl.searchParams.get("everywhere") === "true";

  const refreshPlain =
    req.cookies.get(MANAGER_REFRESH_COOKIE)?.value ??
    (await req
      .json()
      .catch(() => null)
      .then((b: { refreshToken?: string } | null) => b?.refreshToken ?? null));

  if (everywhere) {
    const user = await getCurrentUser(req);
    if (user) {
      await prisma.userRefreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  } else if (refreshPlain) {
    const tokenHash = sha256(refreshPlain);
    await prisma.userRefreshToken
      .update({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  const res = NextResponse.json({ ok: true });
  clearManagerAuthCookies(res);
  return res;
}
