import path from "node:path";

import { getAllowedNextDevOrigins } from "@workspace/runtime/next-dev";
import type { NextConfig } from "next";

import { buildSecurityHeaderRoutes } from "./lib/security-headers";

const repoRoot = path.join(import.meta.dirname, "../..");

const workspacePackages = [
  "@workspace/ui",
  "@workspace/design-tokens",
  "@workspace/calendar-client",
  "@workspace/calendar-core",
  "@workspace/e2ee",
  "@workspace/logger",
  "@workspace/runtime",
] as const;

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: getAllowedNextDevOrigins(),
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/origin-space/origin-images/**",
      },
    ],
  },
  // CSP hosts are derived from NEXT_PUBLIC_* env at build time.
  async headers() {
    return buildSecurityHeaderRoutes(process.env);
  },
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error"] }
        : false,
  },
  transpilePackages: [
    ...workspacePackages,
    "blobatar",
    "@blobatar/react",
    "@paper-design/shaders-react",
    "@paper-design/shaders",
  ],
  turbopack: {
    root: repoRoot,
  },
  experimental: {
    // Turbopack's dev SST cache often fails to commit under Windows (Documents/OneDrive locks).
    turbopackFileSystemCacheForDev: process.platform !== "win32",
    turbopackFileSystemCacheForBuild: true,
    turbopackRustReactCompiler: true,
    turbopackLocalPostcssConfig: true,
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "@tiptap/react",
      "@tiptap/core",
      "@tiptap/starter-kit",
      "radix-ui",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@dnd-kit/modifiers",
    ],
  },
};

export default nextConfig;
