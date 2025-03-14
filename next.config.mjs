/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // This is needed for sigma.js and graphology packages
    config.externals = [...(config.externals || []), { canvas: "canvas" }];
    return config;
  },
  // Enable strict ESLint checking
  eslint: {
    // Do not ignore during builds - ensure all issues are fixed
    ignoreDuringBuilds: false,
    // Treat warnings as errors
    dirs: ['src']
  },
  // Configure image domains for next/image
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.nostr.build',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.nostr.build',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'nostr.build',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'void.cat',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.void.cat',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.imgur.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'imgur.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.imgur.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.gravatar.com',
        pathname: '/**',
      }
    ],
  },
};

export default nextConfig; 