import { randomUUID } from "node:crypto";
import { createLogger } from "@workspace/logger";
import { Elysia } from "elysia";
import type { AuthenticatedUser } from "../lib/auth-utils";
import { requireAuth } from "../lib/auth-guard";
import { env } from "../lib/env";
import { authenticatedRouteDetail } from "../lib/openapi";
import { resolveRouteUser } from "../lib/request-user";
import { MailRealtimeService } from "../services/mail-realtime.service";
import type { MailSyncService } from "../services/mail-sync.service";
import { defaultMailSyncService } from "./mail-sync";

const logger = createLogger("backend:mail-sse");
const encoder = new TextEncoder();

export const defaultMailRealtimeService = new MailRealtimeService({
  eventSourceUrl: `${env.stalwartBaseUrl.replace(/\/+$/, "")}/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}`,
  adminToken: env.stalwartAdminToken,
});

async function writeChunk(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  chunk: string,
) {
  await writer.write(encoder.encode(chunk));
}

function scheduleWrite(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  chunk: string,
  onError: () => void,
) {
  queueMicrotask(() => {
    void writeChunk(writer, chunk).catch(() => {
      onError();
    });
  });
}

export function createRealtimeMailRoutes(input: {
  realtimeService?: MailRealtimeService;
  mailSyncService?: MailSyncService;
} = {}) {
  const realtimeService = input.realtimeService ?? defaultMailRealtimeService;
  const mailSyncService = input.mailSyncService ?? defaultMailSyncService;

  return new Elysia({
    prefix: "/realtime",
    normalize: false,
  })
    .use(requireAuth)
    .guard(authenticatedRouteDetail("Mail"), (app) =>
      app.get(
        "/mail",
        async ({
          authenticatedUser,
          request,
        }: {
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          const accountIds = await mailSyncService.listAuthorizedAccountIdsForUser(user.id);
          const stream = new TransformStream<Uint8Array, Uint8Array>();
          const writer = stream.writable.getWriter();
          const subscriberId = randomUUID();
          let closed = false;
          let keepaliveId: ReturnType<typeof setInterval> | null = null;
          let pollId: ReturnType<typeof setInterval> | null = null;

          const unsubscribe = realtimeService.subscribe({
            subscriberId,
            accountIds,
            onEvent: (event) => {
              scheduleWrite(
                writer,
                `event: mail.changed\ndata: ${JSON.stringify(event)}\n\n`,
                close,
              );
            },
          });

          const close = () => {
            if (closed) {
              return;
            }

            closed = true;
            if (keepaliveId) clearInterval(keepaliveId);
            if (pollId) clearInterval(pollId);
            unsubscribe();
            void writer.close().catch(() => undefined);
            logger.info("Mail SSE client disconnected", {
              subscriberId,
              userId: user.id,
            });
          };

          request.signal.addEventListener("abort", close, { once: true });
          const response = new Response(stream.readable, {
            headers: {
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
              "Content-Type": "text/event-stream",
              "X-Accel-Buffering": "no",
            },
          });

          scheduleWrite(writer, "retry: 5000\n: connected\n\n", close);
          keepaliveId = setInterval(() => {
            scheduleWrite(writer, ": keepalive\n\n", close);
          }, 15000);

          // Server-side polling: Stalwart's EventSource only delivers events for the
          // account that authenticated (the admin account), not for regular user accounts.
          // Polling JMAP /changes with the user's accountId is the reliable delivery path.
          if (accountIds.length > 0) {
            pollId = setInterval(() => {
              if (closed) return;
              void (async () => {
                for (const accountId of accountIds) {
                  try {
                    const { hasChanges, changedTypes } = await mailSyncService.detectChanges({
                      userId: user.id,
                      accountId,
                    });

                    if (!hasChanges || closed) continue;

                    logger.info("Mail poll detected changes", { userId: user.id, accountId, changedTypes });
                    scheduleWrite(
                      writer,
                      `event: mail.changed\ndata: ${JSON.stringify({
                        type: "mail.changed",
                        accountId,
                        changedTypes,
                        receivedAt: new Date().toISOString(),
                      })}\n\n`,
                      close,
                    );
                  } catch (error) {
                    logger.warn("Mail poll check failed", {
                      userId: user.id,
                      accountId,
                      error: error instanceof Error ? error.message : String(error),
                    });
                  }
                }
              })();
            }, 30_000);
          }

          logger.info("Mail SSE client connected", {
            subscriberId,
            userId: user.id,
            accountIds,
          });

          return response;
        },
        {
          detail: {
            summary: "Subscribe to realtime mail change signals",
            description:
              "Streams lightweight mail.changed events for the authenticated user's authorized mail accounts without exposing mailbox content.",
          },
        },
      ),
    );
}

export const realtimeMailRoutes = createRealtimeMailRoutes();
