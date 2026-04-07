/**
 * Push notification utilities using Expo Push API.
 *
 * Sends push notifications to customers via their registered Expo push tokens.
 * Tokens are stored in the push_tokens table and registered via
 * /api/mobile/notifications (action: register_token).
 *
 * Expo Push API docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */

import { prisma } from "@ltex/db";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: "default" | null;
  channelId?: string;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface PushResult {
  sent: number;
  failed: number;
  tickets: ExpoPushTicket[];
}

/**
 * Send a push notification to all active devices of a customer.
 *
 * Looks up push tokens in the DB, batches them into a single Expo API call,
 * and deactivates any tokens that Expo reports as invalid (DeviceNotRegistered).
 */
export async function sendPushNotification(
  customerId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<PushResult> {
  // Fetch all active tokens for this customer
  const tokens = await prisma.pushToken.findMany({
    where: { customerId, active: true },
    select: { id: true, token: true },
  });

  if (tokens.length === 0) {
    return { sent: 0, failed: 0, tickets: [] };
  }

  // Build messages (one per token)
  const messages: ExpoPushMessage[] = tokens.map((t) => ({
    to: t.token,
    title,
    body,
    sound: "default" as const,
    ...(data && { data }),
  }));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.error(
        `Expo Push API error: ${response.status} ${response.statusText}`,
      );
      return { sent: 0, failed: tokens.length, tickets: [] };
    }

    const result = await response.json() as { data: ExpoPushTicket[] };
    const tickets = result.data ?? [];

    // Deactivate tokens that are no longer valid
    const tokensToDeactivate: string[] = [];
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i]!;
      if (ticket.status === "ok") {
        sent++;
      } else {
        failed++;
        // DeviceNotRegistered means the token is invalid — deactivate it
        const tokenRecord = tokens[i];
        if (ticket.details?.error === "DeviceNotRegistered" && tokenRecord) {
          tokensToDeactivate.push(tokenRecord.id);
        }
      }
    }

    // Batch-deactivate invalid tokens
    if (tokensToDeactivate.length > 0) {
      await prisma.pushToken.updateMany({
        where: { id: { in: tokensToDeactivate } },
        data: { active: false },
      }).catch((err) => {
        console.error("Failed to deactivate invalid push tokens:", err);
      });
    }

    return { sent, failed, tickets };
  } catch (err) {
    console.error("Failed to send push notifications:", err);
    return { sent: 0, failed: tokens.length, tickets: [] };
  }
}
