/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui"],
  serverExternalPackages: ['@prisma/client'],
  output: 'standalone',
  env: {
    SKIP_EMAIL_TEMPLATES: 'true',
  },
}

export default nextConfig
