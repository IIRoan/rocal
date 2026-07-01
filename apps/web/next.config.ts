import path from "node:path";

import { getAllowedNextDevOrigins } from "@workspace/runtime/next-dev";
import type { NextConfig } from "next";

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
  output: "export",
  allowedDevOrigins: getAllowedNextDevOrigins(),
  reactCompiler: true,
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error"] }
        : false,
  },
  transpilePackages: [...workspacePackages],
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
      "date-fns-tz",
      "@tiptap/react",
      "@tiptap/core",
      "@tiptap/starter-kit",
      "radix-ui",
      "@phosphor-icons/react",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@dnd-kit/modifiers",
    ],
  },
};

export default nextConfig;
