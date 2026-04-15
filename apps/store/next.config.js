const path = require("path");
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for self-hosted deployment (Windows Server 2022).
  // Produces a self-contained .next/standalone directory with all dependencies.
  output: "standalone",
  // Monorepo: trace files from the repo root so pnpm workspace packages are
  // included in the standalone output.
  outputFileTracingRoot: path.join(__dirname, "../../"),
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
