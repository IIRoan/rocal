/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui"],
  serverExternalPackages: ['@prisma/client', '@react-email/components', '@react-email/render'],
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', '@react-email/components', '@react-email/render'],
  },
  output: 'standalone',
}

export default nextConfig
