import { getAllowedNextDevOrigins } from "@workspace/runtime/next-dev";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  allowedDevOrigins: getAllowedNextDevOrigins(),
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error"] }
        : false,
  },
  transpilePackages: ["@workspace/ui", "@workspace/design-tokens"],
};

export default nextConfig;
