import { getAllowedNextDevOrigins } from "@workspace/runtime/next-dev";

/** @type {import('next').NextConfig} */
const nextConfig = {
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
