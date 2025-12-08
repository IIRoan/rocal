import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    turbo: {
      resolveAlias: {
        '@workspace/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
        '@workspace/ui/*': path.resolve(__dirname, '../../packages/ui/src/*'),
      },
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@workspace/ui/globals.css': path.resolve(__dirname, '../../packages/ui/src/styles/globals.css'),
      '@workspace/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@workspace/ui/*': path.resolve(__dirname, '../../packages/ui/src/*'),
    }
    // Add web app's node_modules to module resolution
    config.resolve.modules = [
      path.resolve(__dirname, 'node_modules'),
      'node_modules',
    ]
    return config
  },
}

export default nextConfig
