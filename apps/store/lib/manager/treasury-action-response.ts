import { NextResponse } from "next/server";
import type { PostResult } from "./treasury-posting";

/** Мапить результат проведення/скасування у HTTP-відповідь. */
export function treasuryActionResponse(result: PostResult): NextResponse {
  if (result.ok) return NextResponse.json({ ok: true });
  const status =
    result.error === "not_found"
      ? 404
      : result.error === "not_draft"
        ? 409
        : result.error === "not_posted"
          ? 409
          : 400;
  const message =
    result.error === "not_found"
      ? "Документ не знайдено"
      : result.error === "not_draft"
        ? "Документ уже проведено або скасовано"
        : result.error === "not_posted"
          ? "Документ не проведено"
          : "Помилка операції";
  return NextResponse.json({ error: message }, { status });
}
