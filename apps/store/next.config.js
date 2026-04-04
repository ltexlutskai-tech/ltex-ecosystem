/** @type {import('next').NextConfig} */
const nextConfig = {
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
};

module.exports = nextConfig;
