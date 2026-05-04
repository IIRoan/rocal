export type RuntimeKind =
  | "expo-go"
  | "expo-native"
  | "expo-web"
  | "nextjs"
  | "browser"
  | "node";

export type RuntimeExecution = "browser" | "native" | "server";
export type RuntimePlatform = "web" | "ios" | "android" | "server" | "unknown";

export interface RuntimeDetectionInput {
  nextRuntime?: string | null;
  platformOs?: string | null;
  expoExecutionEnvironment?: string | null;
  expoAppOwnership?: string | null;
  userAgent?: string | null;
  hasWindow?: boolean;
  hasDocument?: boolean;
  hasNavigator?: boolean;
  hasNextDocumentRoot?: boolean;
}

export interface RuntimeInfo {
  kind: RuntimeKind;
  framework: "expo" | "nextjs" | "web" | "node";
  execution: RuntimeExecution;
  platform: RuntimePlatform;
  isBrowser: boolean;
  isNative: boolean;
  isServer: boolean;
  isWeb: boolean;
  isExpo: boolean;
  isExpoWeb: boolean;
  isExpoNative: boolean;
  isExpoGo: boolean;
  isNextJs: boolean;
}

export interface SupportsSubtleCryptoOptions {
  runtime?: RuntimeInfo;
  runtimeHints?: RuntimeDetectionInput;
  cryptoRef?: {
    subtle?: SubtleCrypto | null;
  } | null;
}

export interface RuntimeOriginPolicyOptions {
  backendUrl?: string | null;
  frontendUrl?: string | null;
  appUrl?: string | null;
  trustedOrigins?: Array<string | null | undefined>;
  isProduction?: boolean;
}

export interface RuntimeOriginPolicy {
  corsOrigins: string[];
  trustedOrigins: string[];
  isOriginAllowed: (origin?: string | null, request?: Request) => boolean;
  getTrustedOrigins: (request?: Request) => string[];
}

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function getProcessEnv(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) {
    return undefined;
  }

  return process.env[name];
}

function normalizePlatform(value?: string | null): RuntimePlatform | undefined {
  switch (value?.trim().toLowerCase()) {
    case "web":
      return "web";
    case "ios":
      return "ios";
    case "android":
      return "android";
    default:
      return undefined;
  }
}

function getNavigatorProduct(): string | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  return navigator.product;
}

function hasNextWindowData(hasWindow: boolean): boolean {
  if (!hasWindow) {
    return false;
  }

  const nextWindow = window as Window & { __NEXT_DATA__?: unknown };
  return typeof nextWindow.__NEXT_DATA__ !== "undefined";
}

function hasNextRoot(hasDocument: boolean, input?: boolean): boolean {
  if (typeof input === "boolean") {
    return input;
  }

  if (!hasDocument) {
    return false;
  }

  return Boolean(document.getElementById("__next"));
}

function createRuntimeInfo(
  kind: RuntimeKind,
  framework: RuntimeInfo["framework"],
  execution: RuntimeExecution,
  platform: RuntimePlatform,
): RuntimeInfo {
  return {
    kind,
    framework,
    execution,
    platform,
    isBrowser: execution === "browser",
    isNative: execution === "native",
    isServer: execution === "server",
    isWeb: platform === "web",
    isExpo: framework === "expo",
    isExpoWeb: kind === "expo-web",
    isExpoNative: kind === "expo-native",
    isExpoGo: kind === "expo-go",
    isNextJs: kind === "nextjs",
  };
}

export function detectRuntime(input: RuntimeDetectionInput = {}): RuntimeInfo {
  const hasWindow = input.hasWindow ?? typeof window !== "undefined";
  const hasDocument = input.hasDocument ?? typeof document !== "undefined";
  const hasNavigator = input.hasNavigator ?? typeof navigator !== "undefined";

  const nextRuntime = input.nextRuntime ?? getProcessEnv("NEXT_RUNTIME");
  const platformOs = normalizePlatform(
    input.platformOs ?? getProcessEnv("EXPO_OS"),
  );
  const expoExecutionEnvironment =
    input.expoExecutionEnvironment?.trim() || undefined;
  const expoAppOwnership = input.expoAppOwnership?.trim() || undefined;
  const navigatorProduct = hasNavigator ? getNavigatorProduct() : undefined;

  if (platformOs === "web") {
    return createRuntimeInfo("expo-web", "expo", "browser", "web");
  }

  if (
    platformOs === "ios" ||
    platformOs === "android" ||
    navigatorProduct === "ReactNative"
  ) {
    const nativePlatform = platformOs ?? "unknown";

    if (
      expoExecutionEnvironment === "storeClient" ||
      expoAppOwnership === "expo"
    ) {
      return createRuntimeInfo("expo-go", "expo", "native", nativePlatform);
    }

    return createRuntimeInfo("expo-native", "expo", "native", nativePlatform);
  }

  if (
    nextRuntime ||
    hasNextRoot(hasDocument, input.hasNextDocumentRoot) ||
    hasNextWindowData(hasWindow)
  ) {
    return createRuntimeInfo(
      "nextjs",
      "nextjs",
      hasWindow || hasDocument ? "browser" : "server",
      hasWindow || hasDocument ? "web" : "server",
    );
  }

  if (hasWindow || hasDocument) {
    return createRuntimeInfo("browser", "web", "browser", "web");
  }

  return createRuntimeInfo("node", "node", "server", "server");
}

export function getRuntimeDisplayName(
  runtime: RuntimeInfo = detectRuntime(),
): string {
  switch (runtime.kind) {
    case "expo-go":
      return "Expo Go";
    case "expo-native":
      return "Expo native";
    case "expo-web":
      return "Expo web";
    case "nextjs":
      return "Next.js";
    case "browser":
      return "Browser";
    case "node":
      return "Node.js";
  }
}

function getGlobalCrypto() {
  if (typeof globalThis === "undefined") {
    return undefined;
  }

  return (globalThis as typeof globalThis & { crypto?: Crypto }).crypto;
}

export function supportsSubtleCrypto(
  options: SupportsSubtleCryptoOptions = {},
): boolean {
  const runtime = options.runtime ?? detectRuntime(options.runtimeHints);

  if (runtime.isServer || runtime.isExpoGo) {
    return false;
  }

  const cryptoRef = options.cryptoRef ?? getGlobalCrypto();
  return Boolean(cryptoRef?.subtle);
}

export function toOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[/, "").replace(/\]$/, "").trim().toLowerCase();
}

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(normalizeHostname(hostname));
}

function isPrivateIpv4(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  const octets = normalized.split(".").map((part) => Number(part));

  if (
    octets.length !== 4 ||
    octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  if (octets[0] === 10 || octets[0] === 127) {
    return true;
  }

  if (octets[0] === 192 && octets[1] === 168) {
    return true;
  }

  const secondOctet = octets[1];

  return octets[0] === 172 && secondOctet !== undefined && secondOctet >= 16 && secondOctet <= 31;
}

function isLocalDevelopmentHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return (
    isLoopbackHost(normalized) ||
    isPrivateIpv4(normalized) ||
    normalized.endsWith(".local")
  );
}

function isEquivalentHost(left: string, right: string): boolean {
  const normalizedLeft = normalizeHostname(left);
  const normalizedRight = normalizeHostname(right);

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  return isLoopbackHost(normalizedLeft) && isLoopbackHost(normalizedRight);
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]),
  );
}

function normalizeTrustedOrigin(value?: string | null): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (HTTP_PROTOCOLS.has(url.protocol)) {
      return url.origin;
    }
  } catch {
    return trimmed.replace(/\/+$/, "");
  }

  return trimmed.replace(/\/+$/, "");
}

function extractHttpOrigin(value?: string | null): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (HTTP_PROTOCOLS.has(url.protocol)) {
      return url.origin;
    }
  } catch {
    return null;
  }

  return null;
}

function extractHostname(value?: string | null): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).hostname;
  } catch {
    return null;
  }
}

function getRequestOrigin(request?: Request): string | null {
  return request?.headers.get("origin")?.trim() || null;
}

function getRequestHostname(request?: Request): string | null {
  if (!request) {
    return null;
  }

  try {
    return new URL(request.url).hostname;
  } catch {
    return null;
  }
}

export function createRuntimeOriginPolicy(
  options: RuntimeOriginPolicyOptions,
): RuntimeOriginPolicy {
  const trustedOrigins = unique(
    [
      options.backendUrl,
      options.frontendUrl,
      options.appUrl,
      ...(options.trustedOrigins ?? []),
    ].map(normalizeTrustedOrigin),
  );
  const corsOrigins = unique(trustedOrigins.map(extractHttpOrigin));
  const configuredHostnames = unique(
    [
      options.backendUrl,
      options.frontendUrl,
      options.appUrl,
      ...trustedOrigins,
    ].map(extractHostname),
  );

  const isOriginAllowed = (origin?: string | null, request?: Request) => {
    const normalizedOrigin = normalizeTrustedOrigin(origin);

    if (!normalizedOrigin) {
      return false;
    }

    if (trustedOrigins.includes(normalizedOrigin)) {
      return true;
    }

    const httpOrigin = extractHttpOrigin(normalizedOrigin);

    if (!httpOrigin) {
      return false;
    }

    if (corsOrigins.includes(httpOrigin)) {
      return true;
    }

    if (options.isProduction) {
      return false;
    }

    const originUrl = new URL(httpOrigin);
    const candidateHostnames = unique([
      getRequestHostname(request),
      ...configuredHostnames,
    ]);

    return candidateHostnames.some(
      (candidateHostname) =>
        isEquivalentHost(originUrl.hostname, candidateHostname) &&
        isLocalDevelopmentHost(candidateHostname),
    );
  };

  const getTrustedOrigins = (request?: Request) => {
    const resolvedOrigins = new Set(trustedOrigins);
    const requestOrigin = getRequestOrigin(request);

    if (requestOrigin && isOriginAllowed(requestOrigin, request)) {
      const normalizedOrigin = normalizeTrustedOrigin(requestOrigin);
      if (normalizedOrigin) {
        resolvedOrigins.add(normalizedOrigin);
      }
    }

    return [...resolvedOrigins];
  };

  return {
    corsOrigins,
    trustedOrigins,
    isOriginAllowed,
    getTrustedOrigins,
  };
}
