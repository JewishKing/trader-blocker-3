/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === 'development'

const nextConfig = {
  // 'export' is only for production build (electron package)
  // In dev mode we use the Next.js dev server directly
  ...(isDev ? {} : { output: 'export', trailingSlash: true }),
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  productionBrowserSourceMaps: false,
}

export default nextConfig
