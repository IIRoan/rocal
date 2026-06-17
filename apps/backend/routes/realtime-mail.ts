import { randomUUID } from "node:crypto";
import { createLogger } from "@workspace/logger";
import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { env } from "../lib/env";
import { authenticatedRouteDetail } from "../lib/openapi";
import {
  MailRealtimeService,
  resolveChangedTypes,
} from "../services/mail-realtime.service";
import type { MailSyncService } from "../services/mail-sync.service";
import { defaultMailSyncService } from "./mail-sync";
import { errorString } from "../lib/errors";

const logger = createLogger("backend:mail-sse");
const encoder = new TextEncoder();

export const defaultMailRealtimeService = new MailRealtimeService({
  eventSourceUrl: `${env.stalwartBaseUrl.replace(/\/+$/, "")}/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}`,
  adminToken: env.stalwartAdminToken,
  syncProvider: defaultMailSyncService,
  receiptPollIntervalMs: 10_000,
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

export function createRealtimeMailRoutes(
  input: {
    realtimeService?: MailRealtimeService;
    mailSyncService?: MailSyncService;
  } = {},
) {
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
        async ({ routeUser, request }) => {
          const accountIds =
            await mailSyncService.listAuthorizedAccountIdsForUser(routeUser.id);
          const stream = new TransformStream<Uint8Array, Uint8Array>();
          const writer = stream.writable.getWriter();
          const subscriberId = randomUUID();
          let closed = false;
          let keepaliveId: ReturnType<typeof setInterval> | null = null;
          let pollId: ReturnType<typeof setInterval> | null = null;
          let pollInFlight = false;

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
              userId: routeUser.id,
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
              if (closed || pollInFlight) return;
              pollInFlight = true;
              void (async () => {
                for (const accountId of accountIds) {
                  try {
                    const { hasChanges, changedTypes } =
                      await mailSyncService.detectChanges({
                        userId: routeUser.id,
                        accountId,
                      });

                    if (!hasChanges || closed) continue;
                    const sync = await mailSyncService.syncForUser({
                      userId: routeUser.id,
                      accountId,
                    });
                    const resolvedChangedTypes = resolveChangedTypes(
                      sync.changedTypes,
                      changedTypes,
                    );

                    logger.info("Mail poll detected changes", {
                      userId: routeUser.id,
                      accountId,
                      changedTypes: resolvedChangedTypes,
                    });
                    scheduleWrite(
                      writer,
                      `event: mail.changed\ndata: ${JSON.stringify({
                        type: "mail.changed",
                        accountId,
                        changedTypes: resolvedChangedTypes,
                        receivedAt: new Date().toISOString(),
                        sync,
                      })}\n\n`,
                      close,
                    );
                  } catch (error) {
                    logger.warn("Mail poll check failed", {
                      userId: routeUser.id,
                      accountId,
                      error:
                        errorString(error),
                    });
                  }
                }
              })().finally(() => {
                pollInFlight = false;
              });
            }, 10_000);
          }

          logger.info("Mail SSE client connected", {
            subscriberId,
            userId: routeUser.id,
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
