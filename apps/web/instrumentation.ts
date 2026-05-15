import { installGlobalConsoleLogger } from "@workspace/logger";

export function register() {
  installGlobalConsoleLogger("next");

  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Cast process to any to avoid edge runtime parsing issues in Next.js
    // where any literal process.stdout usage causes static analysis failures
    const proc = process as any;
    if (proc.stdout) {
      const originalStdoutWrite = proc.stdout.write.bind(proc.stdout);

      proc.stdout.write = (
        chunk: string | Uint8Array,
        encoding?: any,
        cb?: any,
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
              console.error(cleanStr);
            } else if (
              cleanStr.startsWith("wait ") ||
              cleanStr.startsWith("ready ") ||
              cleanStr.startsWith("○ ")
            ) {
              console.info(cleanStr);
            } else {
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
}
