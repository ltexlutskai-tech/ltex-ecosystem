import { NextRequest } from "next/server";
import { prisma } from "@ltex/db";
import { verifyMobileToken, verifyMobileTokenString } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/chat/stream
 *
 * Server-Sent Events endpoint for real-time chat messages.
 *
 * Auth: Bearer <token> via Authorization header OR ?token=<...> query param
 *       (EventSource in the browser cannot set custom headers, so query is supported).
 *
 * Polls the DB every 3 seconds for new messages and sends them as SSE events.
 * Sends a heartbeat every 15 seconds to keep the connection alive.
 * Times out after 5 minutes (client should reconnect).
 */

const POLL_INTERVAL_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const TIMEOUT_MS = 5 * 60 * 1_000; // 5 minutes

export async function GET(request: NextRequest) {
  let session = verifyMobileToken(request);
  if (!session) {
    const qsToken = request.nextUrl.searchParams.get("token");
    if (qsToken) session = verifyMobileTokenString(qsToken);
  }
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { customerId } = session;

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Track the latest message timestamp so we only send new ones
      let lastSeenCreatedAt: Date | null = null;

      // Initialize from the most recent message
      const latest = await prisma.chatMessage.findFirst({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      });
      if (latest) {
        lastSeenCreatedAt = latest.createdAt;
      }

      // Send initial connected event
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({ customerId })}\n\n`,
        ),
      );

      // Poll for new messages
      const pollTimer = setInterval(async () => {
        if (closed) return;
        try {
          const where: Record<string, unknown> = { customerId };
          if (lastSeenCreatedAt) {
            // Get messages created after the last one we saw
            where.createdAt = { gt: lastSeenCreatedAt };
          }

          const newMessages = await prisma.chatMessage.findMany({
            where,
            orderBy: { createdAt: "asc" },
          });

          for (const msg of newMessages) {
            if (closed) return;
            const data = {
              id: msg.id,
              sender: msg.sender,
              text: msg.text,
              imageUrl: msg.imageUrl,
              isRead: msg.isRead,
              createdAt: msg.createdAt,
            };
            controller.enqueue(
              encoder.encode(
                `event: message\ndata: ${JSON.stringify(data)}\n\n`,
              ),
            );
            lastSeenCreatedAt = msg.createdAt;
          }
        } catch {
          if (closed) return;
          // Send error event but keep connection alive
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ error: "poll_failed" })}\n\n`,
            ),
          );
        }
      }, POLL_INTERVAL_MS);

      // Heartbeat to keep connection alive
      const heartbeatTimer = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          // Connection likely closed
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Timeout after 5 minutes — client should reconnect
      const timeoutTimer = setTimeout(() => {
        cleanup();
        if (!closed) {
          closed = true;
          try {
            controller.enqueue(
              encoder.encode(
                `event: timeout\ndata: ${JSON.stringify({ reason: "max_duration" })}\n\n`,
              ),
            );
            controller.close();
          } catch {
            // Already closed
          }
        }
      }, TIMEOUT_MS);

      function cleanup() {
        clearInterval(pollTimer);
        clearInterval(heartbeatTimer);
        clearTimeout(timeoutTimer);
      }

      // Handle client disconnect via AbortSignal
      request.signal.addEventListener("abort", () => {
        cleanup();
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable Nginx buffering
    },
  });
}
