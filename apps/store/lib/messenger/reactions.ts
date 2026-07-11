import type { MessengerReactionSummary } from "./types";

/** Дозволені emoji-реакції (обмежений набір проти зловживань). */
export const ALLOWED_REACTIONS = [
  "👍",
  "❤️",
  "🔥",
  "😂",
  "✅",
  "🙏",
  "👀",
  "😢",
] as const;

export function isAllowedReaction(emoji: string): boolean {
  return (ALLOWED_REACTIONS as readonly string[]).includes(emoji);
}

interface ReactionRow {
  emoji: string;
  userId: string;
}

/**
 * Зводить рядки реакцій у список {emoji, count, mine}, впорядкований за
 * ALLOWED_REACTIONS.
 */
export function summarizeReactions(
  rows: ReactionRow[],
  currentUserId: string,
): MessengerReactionSummary[] {
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of rows) {
    const cur = map.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.userId === currentUserId) cur.mine = true;
    map.set(r.emoji, cur);
  }
  return [...map.entries()]
    .map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine }))
    .sort(
      (a, b) =>
        ALLOWED_REACTIONS.indexOf(
          a.emoji as (typeof ALLOWED_REACTIONS)[number],
        ) -
        ALLOWED_REACTIONS.indexOf(
          b.emoji as (typeof ALLOWED_REACTIONS)[number],
        ),
    );
}
