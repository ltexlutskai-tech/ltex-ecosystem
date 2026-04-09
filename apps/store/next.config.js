const path = require("path");
const { PrismaPlugin } = require("@prisma/nextjs-monorepo-workaround-plugin");
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Monorepo: trace files from the repo root so pnpm workspace packages are
  // picked up by Netlify's serverless bundle.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Load Prisma as an external package at runtime (prevents webpack from
  // bundling the .node native binding, which the loader can't find later).
  serverExternalPackages: ["@prisma/client", ".prisma/client", "prisma"],
  // Prisma ships its query engine as a `.node` native binary that Next.js
  // output file tracing misses in a pnpm monorepo. PrismaPlugin copies the
  // required engine next to the bundled server output so it resolves at
  // runtime on Netlify Lambda (rhel-openssl-3.0.x).
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.plugins = [...(config.plugins || []), new PrismaPlugin()];
    }
    return config;
  },
  transpilePackages: ["@ltex/ui", "@ltex/shared", "@ltex/db"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.supabase.co https://img.youtube.com",
              "font-src 'self'",
              "connect-src 'self' https://*.supabase.co",
              "frame-src https://www.youtube.com https://youtube.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

module.exports = withBundleAnalyzer(nextConfig);
