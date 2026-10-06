import * as Sentry from "@sentry/nextjs";
import { installGlobalConsoleLogger } from "@workspace/logger";

export async function register() {
  installGlobalConsoleLogger("next");

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Indirect access only: a literal process.stdout reference breaks Next.js edge static analysis.
    const proc = process as {
      stdout?: {
        write: (
          chunk: string | Uint8Array,
          encoding?: BufferEncoding,
          cb?: (error?: Error | null) => void,
        ) => boolean;
      };
    };
    if (proc.stdout) {
      const originalStdoutWrite = proc.stdout.write.bind(proc.stdout);

      proc.stdout.write = (
        chunk: string | Uint8Array,
        encoding?: BufferEncoding,
        cb?: (error?: Error | null) => void,
      ) => {
        if (typeof chunk === "string") {
          const cleanStr = chunk.replace(/\x1B\[\d+m/g, "").trim();

          // Match Next.js HTTP request logs (e.g., "GET /... 200 in ...ms")
          // as well as other Next.js internal logs like "✓ Compiled"
          if (
            cleanStr.startsWith("GET ") ||
            cleanStr.startsWith("POST ") ||
            cleanStr.startsWith("PUT ") ||
            cleanStr.startsWith("DELETE ") ||
            cleanStr.startsWith("PATCH ") ||
            cleanStr.startsWith("OPTIONS ") ||
            cleanStr.startsWith("✓ ") ||
            cleanStr.startsWith("○ ") ||
            cleanStr.startsWith("▲ ") ||
            cleanStr.startsWith("⨯ ") ||
            cleanStr.startsWith("wait ") ||
            cleanStr.startsWith("ready ")
          ) {
            if (cleanStr.includes("⨯ ")) {
              // repo-rules-allow client-safe-logging: re-emits a Next.js server log line (method, path, status), not user data.
              console.error(cleanStr);
            } else if (
              cleanStr.startsWith("wait ") ||
              cleanStr.startsWith("ready ") ||
              cleanStr.startsWith("○ ")
            ) {
              // repo-rules-allow client-safe-logging: re-emits a Next.js server log line (method, path, status), not user data.
              console.info(cleanStr);
            } else {
              // repo-rules-allow client-safe-logging: re-emits a Next.js server log line (method, path, status), not user data.
              console.log(cleanStr);
            }
            return true;
          }
        }

        // For all other logs, use the original write
        if (typeof encoding === "function") {
          return originalStdoutWrite(chunk, encoding);
        } else {
          return originalStdoutWrite(chunk, encoding, cb);
        }
      };
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
