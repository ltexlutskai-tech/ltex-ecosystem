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
  // Explicitly include the Prisma query engine binaries in every route's
  // trace so Netlify's Lambda bundler always ships them alongside the
  // serverless function. Without this, the engine .node file can be missed
  // by automatic file tracing (since it's loaded via `require` from inside
  // the external @prisma/client package), and runtime fails with
  // PrismaClientInitializationError "could not locate the Query Engine".
  outputFileTracingIncludes: {
    "/**/*": [
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/libquery_engine-*.so.node",
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/schema.prisma",
      "../../node_modules/.pnpm/@prisma+client*/node_modules/@prisma/client/**/*",
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/**/*",
      "../../packages/db/prisma/schema.prisma",
    ],
  },
  // Load Prisma as an external package at runtime (prevents webpack from
  // bundling the .node native binding, which the loader can't find later).
  serverExternalPackages: ["@prisma/client", ".prisma/client", "prisma"],
  // Server Actions default body limit is 1 MB, which is too small for admin
  // image uploads (banners, product photos). High-res AI-generated banners
  // (1920×600 JPG/PNG) can easily be 2-5 MB. Bump the limit to 10 MB so
  // uploads don't fail at the framework level with the opaque
  // "An unexpected response was received from the server" error.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
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
      {
        protocol: "https",
        hostname: "i.ytimg.com",
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
              "img-src 'self' data: blob: https://*.supabase.co https://img.youtube.com https://i.ytimg.com",
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
