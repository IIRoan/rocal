import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import zlib from "node:zlib";
import {
  canonicalizeHostForSsrfCheck,
  isPrivateNetworkHost,
} from "./ssrf-host-policy";

/** Uses `node:http(s).request` because only its `lookup` hook makes the address check rebinding-safe. */

export type SafeFetchErrorCode =
  | "invalid-url"
  | "unsupported-scheme"
  | "private-network-host"
  | "too-many-redirects"
  | "redirect-without-location"
  | "timeout"
  | "response-too-large"
  | "request-failed";

export class SafeFetchError extends Error {
  constructor(
    readonly code: SafeFetchErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "SafeFetchError";
  }
}

export type SafeFetchResolver = (hostname: string) => Promise<LookupAddress[]>;

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  /** Test seam: DNS resolver used inside the connect-time lookup hook. */
  resolve?: SafeFetchResolver;
  /** Test seam: address policy; defaults to `isPrivateNetworkHost`. */
  isBlockedAddress?: (address: string) => boolean;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

const defaultResolve: SafeFetchResolver = (hostname) =>
  new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: true }, (error, addresses) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(addresses);
    });
  });

/** Parse and normalize a user URL; `webcal:` is treated as `https:`. */
export function parseSafeFetchUrl(
  rawUrl: string,
  isBlockedAddress: (address: string) => boolean = isPrivateNetworkHost,
): URL {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new SafeFetchError("invalid-url");
  }

  if (url.protocol === "webcal:") {
    url = new URL(`https:${url.href.slice("webcal:".length)}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchError("unsupported-scheme");
  }
  if (url.username || url.password) {
    throw new SafeFetchError("invalid-url");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host) {
    throw new SafeFetchError("invalid-url");
  }
  const canonical = canonicalizeHostForSsrfCheck(host);
  const blocked = isIP(canonical)
    ? isBlockedAddress(canonical)
    : isPrivateNetworkHost(host);
  if (blocked) {
    throw new SafeFetchError("private-network-host");
  }

  return url;
}

/** Hands the socket only addresses that passed the policy, so the checked IP is the connected IP. */
export function createValidatingLookup(
  resolve: SafeFetchResolver,
  isBlockedAddress: (address: string) => boolean,
): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname)
      .then((addresses) => {
        const family =
          typeof options === "object" && options ? options.family : undefined;
        const wanted =
          family === 4 || family === 6
            ? addresses.filter((entry) => entry.family === family)
            : addresses;

        if (
          wanted.length === 0 ||
          wanted.some((entry) => isBlockedAddress(entry.address))
        ) {
          callback(
            new SafeFetchError("private-network-host") as NodeJS.ErrnoException,
            "",
            0,
          );
          return;
        }

        if (typeof options === "object" && options?.all) {
          (callback as unknown as (err: null, addresses: LookupAddress[]) => void)(
            null,
            wanted,
          );
          return;
        }
        const first = wanted[0] as LookupAddress;
        callback(null, first.address, first.family);
      })
      .catch((error: unknown) => {
        callback(
          (error instanceof Error ? error : new Error("lookup-failed")) as NodeJS.ErrnoException,
          "",
          0,
        );
      });
  };
}

function decodeBody(
  response: http.IncomingMessage,
): NodeJS.ReadableStream {
  const encoding = String(response.headers["content-encoding"] ?? "")
    .trim()
    .toLowerCase();
  if (encoding === "gzip" || encoding === "x-gzip") {
    return response.pipe(zlib.createGunzip());
  }
  if (encoding === "deflate") {
    return response.pipe(zlib.createInflate());
  }
  if (encoding === "br") {
    return response.pipe(zlib.createBrotliDecompress());
  }
  return response;
}

function toHeaders(raw: http.IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined || name === "content-encoding" || name === "content-length") {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      headers.append(name, item);
    }
  }
  return headers;
}

function concatChunks(chunks: Buffer[], total: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

interface HopResult {
  status: number;
  statusText: string;
  headers: Headers;
  location: string | null;
  body: Uint8Array<ArrayBuffer> | null;
}

function requestOnce(
  url: URL,
  options: SafeFetchOptions,
  lookup: LookupFunction,
  deadline: number,
): Promise<HopResult> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    return Promise.reject(new SafeFetchError("timeout"));
  }

  const transport = url.protocol === "https:" ? https : http;

  return new Promise<HopResult>((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.destroy();
      reject(
        error instanceof SafeFetchError
          ? error
          : new SafeFetchError("request-failed"),
      );
    };

    const request = transport.request(
      url,
      {
        method: "GET",
        agent: false,
        lookup,
        headers: {
          "Accept-Encoding": "gzip, deflate, br",
          ...options.headers,
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location ?? null;

        if (REDIRECT_STATUSES.has(status) || NULL_BODY_STATUSES.has(status)) {
          response.resume();
          settled = true;
          clearTimeout(timer);
          resolve({
            status,
            statusText: response.statusMessage ?? "",
            headers: toHeaders(response.headers),
            location,
            body: null,
          });
          request.destroy();
          return;
        }

        const declaredLength = Number(response.headers["content-length"]);
        if (
          Number.isFinite(declaredLength) &&
          !response.headers["content-encoding"] &&
          declaredLength > options.maxBytes
        ) {
          fail(new SafeFetchError("response-too-large"));
          return;
        }

        const chunks: Buffer[] = [];
        let received = 0;
        const body = decodeBody(response);
        body.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > options.maxBytes) {
            fail(new SafeFetchError("response-too-large"));
            return;
          }
          chunks.push(chunk);
        });
        body.on("error", fail);
        body.on("end", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({
            status,
            statusText: response.statusMessage ?? "",
            headers: toHeaders(response.headers),
            location,
            body: concatChunks(chunks, received),
          });
        });
      },
    );

    const timer = setTimeout(
      () => fail(new SafeFetchError("timeout")),
      remaining,
    );
    request.on("error", (error: Error) => {
      const cause = (error as { cause?: unknown }).cause;
      fail(
        error instanceof SafeFetchError
          ? error
          : cause instanceof SafeFetchError
            ? cause
            : error.message === "private-network-host"
              ? new SafeFetchError("private-network-host")
              : error,
      );
    });
    request.end();
  });
}

/** GET a user URL with SSRF protection; every redirect hop is re-validated. */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions,
): Promise<Response> {
  const isBlockedAddress = options.isBlockedAddress ?? isPrivateNetworkHost;
  const lookup = createValidatingLookup(
    options.resolve ?? defaultResolve,
    isBlockedAddress,
  );
  const deadline = Date.now() + options.timeoutMs;
  let url = parseSafeFetchUrl(rawUrl, isBlockedAddress);

  for (let hop = 0; hop <= options.maxRedirects; hop++) {
    const result = await requestOnce(url, options, lookup, deadline);

    if (!REDIRECT_STATUSES.has(result.status)) {
      return new Response(
        result.body && !NULL_BODY_STATUSES.has(result.status)
          ? new Blob([result.body])
          : null,
        {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
        },
      );
    }

    if (!result.location) {
      throw new SafeFetchError("redirect-without-location");
    }
    let next: string;
    try {
      next = new URL(result.location, url).toString();
    } catch {
      throw new SafeFetchError("invalid-url");
    }
    url = parseSafeFetchUrl(next, isBlockedAddress);
  }

  throw new SafeFetchError("too-many-redirects");
}
