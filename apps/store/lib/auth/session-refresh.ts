import { NextRequest, NextResponse } from "next/server";
import { MANAGER_REFRESH_COOKIE } from "@/lib/auth/manager-auth";

/**
 * Тихо поновлює сесію менеджера/адміна, коли короткий access-токен (15 хв)
 * протух, а довга refresh-кука ще жива.
 *
 * Викликає роут /api/v1/manager/auth/refresh як під-запит (він звіряє refresh-
 * токен з БД, ротує його й повертає свіжі кукі), після чого редіректить на ту
 * саму адресу — повторний запит уже несе дійсний access-токен, тож користувача
 * НЕ викидає на екран входу під час роботи.
 *
 * Повертає null за будь-якої невдачі (нема refresh-куки, 401, помилка мережі);
 * тоді викликач має зробити звичайний редірект на сторінку входу. Тобто у
 * найгіршому разі поведінка не гірша за стару.
 */
export async function tryRefreshSession(
  req: NextRequest,
): Promise<NextResponse | null> {
  if (!req.cookies.get(MANAGER_REFRESH_COOKIE)?.value) return null;
  try {
    const refreshUrl = new URL(
      "/api/v1/manager/auth/refresh",
      req.nextUrl.origin,
    );
    const res = await fetch(refreshUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: req.headers.get("cookie") ?? "",
      },
      body: "{}",
    });
    if (!res.ok) return null;
    const setCookies = res.headers.getSetCookie();
    if (setCookies.length === 0) return null;

    const redirect = NextResponse.redirect(req.nextUrl);
    for (const cookie of setCookies) {
      redirect.headers.append("set-cookie", cookie);
    }
    return redirect;
  } catch {
    return null;
  }
}
