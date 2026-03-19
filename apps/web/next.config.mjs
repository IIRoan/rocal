import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  allowedDevOrigins: ['192.168.88.242'],
  transpilePackages: ['@workspace/ui'],
  turbopack: {
    resolveAlias: {
      '@workspace/ui/globals.css': path.resolve(__dirname, '../../packages/ui/src/styles/globals.css'),
      '@workspace/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
      'react-native': 'react-native-web',
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@workspace/ui/globals.css': path.resolve(__dirname, '../../packages/ui/src/styles/globals.css'),
      '@workspace/ui': path.resolve(__dirname, '../../packages/ui/src'),
      'react-native$': 'react-native-web',
    }
    return config
  },
}

export default nextConfig
