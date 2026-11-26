import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // The development-only "N" indicator defaults to bottom-left, where it covers the mobile bottom
  // nav's Home item. Top-right is clear at every width. It never appears in production builds.
  devIndicators: { position: "top-right" },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
