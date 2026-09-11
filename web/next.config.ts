import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    loader: "custom",
    loaderFile: "./lib/cloudinary-loader.ts",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/calculators/gre-to-gmat",
        destination: "/calculators/gre-to-gmat-conversion",
        permanent: true,
      },
      {
        source: "/calculators/toefl-to-ielts",
        destination: "/calculators/toefl-to-ielts-conversion",
        permanent: true,
      },
      {
        source: "/calculators/sat-to-act",
        destination: "/calculators/sat-to-act-conversion",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    const rawTarget = (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000").replace(/\/$/, "");
    const apiTarget = rawTarget.replace("://localhost:", "://127.0.0.1:");
    return [
      {
        source: "/api/:path*",
        destination: `${apiTarget}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${apiTarget}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
