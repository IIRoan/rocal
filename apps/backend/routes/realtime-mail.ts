import { randomUUID } from "node:crypto";
import { createLogger } from "@workspace/logger";
import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { env } from "../lib/env";
import { authenticatedRouteDetail } from "../lib/openapi";
import { MailRealtimeService } from "../services/mail-realtime.service";
import type { MailSyncService } from "../services/mail-sync.service";
import { defaultMailSyncService } from "./mail-sync";
import { logRef } from "../lib/log-sanitization";

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
    heartbeatIntervalMs?: number;
  } = {},
) {
  const realtimeService = input.realtimeService ?? defaultMailRealtimeService;
  const mailSyncService = input.mailSyncService ?? defaultMailSyncService;
  const heartbeatIntervalMs = input.heartbeatIntervalMs ?? 15_000;

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
            unsubscribe();
            void writer.close().catch(() => undefined);
            logger.info("Mail SSE client disconnected", {
              subscriberId,
              userRef: logRef(routeUser.id),
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
          }, heartbeatIntervalMs);

          logger.info("Mail SSE client connected", {
            subscriberId,
            userRef: logRef(routeUser.id),
            accountCount: accountIds.length,
          });

          return response;
        },
        {
          detail: {
            summary: "Subscribe to realtime mail change signals",
            description:
              "Streams mail.changed events for the authenticated user's authorized mail accounts without exposing mailbox content.",
          },
        },
      ),
    );
}

export const realtimeMailRoutes = createRealtimeMailRoutes();
