import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  assetPrefix: "./",
  output: "export",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
