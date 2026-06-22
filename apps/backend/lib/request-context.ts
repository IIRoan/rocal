import { Elysia } from "elysia";

const REQUEST_ID_HEADER = "x-request-id";
const MAX_REQUEST_ID_LENGTH = 128;

export function resolveRequestId(request: Request | undefined): string {
  const fromHeader = request?.headers.get(REQUEST_ID_HEADER)?.trim();
  if (fromHeader && fromHeader.length > 0 && fromHeader.length <= MAX_REQUEST_ID_LENGTH) {
    return fromHeader;
  }

  return crypto.randomUUID();
}

/**
 * Assigns a request id for log correlation and echoes it on every response.
 */
export const requestContext = new Elysia({ name: "request-context" })
  .derive(({ request }) => ({
    requestId: resolveRequestId(request),
  }))
  .onAfterHandle(({ set, requestId }) => {
    set.headers[REQUEST_ID_HEADER] = requestId;
  });
