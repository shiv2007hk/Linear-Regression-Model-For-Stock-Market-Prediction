/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  images: { qualities: [75, 88] },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
