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
      // Calculator redirects
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

      // Legacy WordPress & Google Indexed Product Redirects
      {
        source: "/discounted-pte-voucher",
        destination: "/exam-vouchers/pearson-pte-academic-voucher",
        permanent: true,
      },
      {
        source: "/discounted-pte-academic-voucher",
        destination: "/exam-vouchers/pearson-pte-academic-voucher",
        permanent: true,
      },
      {
        source: "/pte-voucher",
        destination: "/exam-vouchers/pearson-pte-academic-voucher",
        permanent: true,
      },
      {
        source: "/pte-academic-voucher",
        destination: "/exam-vouchers/pearson-pte-academic-voucher",
        permanent: true,
      },
      {
        source: "/pte-academic",
        destination: "/exam-vouchers/pearson-pte-academic-voucher",
        permanent: true,
      },
      {
        source: "/discounted-pte-core-voucher",
        destination: "/exam-vouchers/pearson-pte-core-voucher",
        permanent: true,
      },
      {
        source: "/pte-core-voucher",
        destination: "/exam-vouchers/pearson-pte-core-voucher",
        permanent: true,
      },
      {
        source: "/pte-core",
        destination: "/exam-vouchers/pearson-pte-core-voucher",
        permanent: true,
      },
      {
        source: "/pte-practice-test",
        destination: "/exam-vouchers/pearson-pte-practice-test",
        permanent: true,
      },
      {
        source: "/discounted-toefl-voucher",
        destination: "/exam-vouchers/ets-toefl-voucher",
        permanent: true,
      },
      {
        source: "/toefl-voucher",
        destination: "/exam-vouchers/ets-toefl-voucher",
        permanent: true,
      },
      {
        source: "/discounted-gre-voucher",
        destination: "/exam-vouchers/ets-gre-voucher",
        permanent: true,
      },
      {
        source: "/gre-voucher",
        destination: "/exam-vouchers/ets-gre-voucher",
        permanent: true,
      },
      {
        source: "/discounted-duolingo-voucher",
        destination: "/exam-vouchers/duolingo-english-test-voucher",
        permanent: true,
      },
      {
        source: "/duolingo-voucher",
        destination: "/exam-vouchers/duolingo-english-test-voucher",
        permanent: true,
      },
      {
        source: "/ielts-voucher",
        destination: "/exam-vouchers/ielts-exam-voucher",
        permanent: true,
      },
      {
        source: "/discounted-ielts-voucher",
        destination: "/exam-vouchers/ielts-exam-voucher",
        permanent: true,
      },

      // Specific Legacy Shop product URLs to direct product pages
      {
        source: "/shop/discounted-pte-voucher/:path*",
        destination: "/exam-vouchers/pearson-pte-academic-voucher",
        permanent: true,
      },
      {
        source: "/shop/discounted-pte-voucher",
        destination: "/exam-vouchers/pearson-pte-academic-voucher",
        permanent: true,
      },
      {
        source: "/shop/pte-core-voucher/:path*",
        destination: "/exam-vouchers/pearson-pte-core-voucher",
        permanent: true,
      },
      {
        source: "/shop/pte-core-voucher",
        destination: "/exam-vouchers/pearson-pte-core-voucher",
        permanent: true,
      },
      {
        source: "/shop/pte-practice-mock-test/:path*",
        destination: "/exam-vouchers/pearson-pte-practice-test",
        permanent: true,
      },
      {
        source: "/shop/pte-practice-mock-test",
        destination: "/exam-vouchers/pearson-pte-practice-test",
        permanent: true,
      },
      {
        source: "/shop/duolingo-english-test-voucher/:path*",
        destination: "/exam-vouchers/duolingo-english-test-voucher",
        permanent: true,
      },
      {
        source: "/shop/duolingo-english-test-voucher",
        destination: "/exam-vouchers/duolingo-english-test-voucher",
        permanent: true,
      },
      {
        source: "/shop/duolingo/:path*",
        destination: "/exam-vouchers/duolingo-english-test-voucher",
        permanent: true,
      },
      {
        source: "/shop/duolingo",
        destination: "/exam-vouchers/duolingo-english-test-voucher",
        permanent: true,
      },
      {
        source: "/shop/toefl/:path*",
        destination: "/exam-vouchers/ets-toefl-voucher",
        permanent: true,
      },
      {
        source: "/shop/toefl",
        destination: "/exam-vouchers/ets-toefl-voucher",
        permanent: true,
      },
      {
        source: "/shop/gre/:path*",
        destination: "/exam-vouchers/ets-gre-voucher",
        permanent: true,
      },
      {
        source: "/shop/gre",
        destination: "/exam-vouchers/ets-gre-voucher",
        permanent: true,
      },
      {
        source: "/all-vouchers/pte-exam-vouchers/:path*",
        destination: "/exam-vouchers/pearson-pte-academic-voucher",
        permanent: true,
      },
      {
        source: "/all-vouchers/pte-exam-vouchers",
        destination: "/exam-vouchers/pearson-pte-academic-voucher",
        permanent: true,
      },
      {
        source: "/all-vouchers/toefl-exam-vouchers/:path*",
        destination: "/exam-vouchers/ets-toefl-voucher",
        permanent: true,
      },
      {
        source: "/all-vouchers/toefl-exam-vouchers",
        destination: "/exam-vouchers/ets-toefl-voucher",
        permanent: true,
      },
      {
        source: "/all-vouchers/gre-exam-voucher/:path*",
        destination: "/exam-vouchers/ets-gre-voucher",
        permanent: true,
      },
      {
        source: "/all-vouchers/gre-exam-voucher",
        destination: "/exam-vouchers/ets-gre-voucher",
        permanent: true,
      },
      {
        source: "/all-vouchers/duolingo-vouchers/:path*",
        destination: "/exam-vouchers/duolingo-english-test-voucher",
        permanent: true,
      },
      {
        source: "/all-vouchers/duolingo-vouchers",
        destination: "/exam-vouchers/duolingo-english-test-voucher",
        permanent: true,
      },

      // Catalog & Shop URLs
      {
        source: "/all-vouchers",
        destination: "/exam-vouchers",
        permanent: true,
      },
      {
        source: "/vouchers",
        destination: "/exam-vouchers",
        permanent: true,
      },
      {
        source: "/shop",
        destination: "/exam-vouchers",
        permanent: true,
      },
      {
        source: "/products",
        destination: "/exam-vouchers",
        permanent: true,
      },
      {
        source: "/product-category/:path*",
        destination: "/exam-vouchers",
        permanent: true,
      },

      // Legacy WordPress standard pages
      {
        source: "/cart",
        destination: "/exam-vouchers",
        permanent: true,
      },
      {
        source: "/checkout",
        destination: "/exam-vouchers",
        permanent: true,
      },
      {
        source: "/my-account",
        destination: "/account",
        permanent: true,
      },
      {
        source: "/contact-us",
        destination: "/contact",
        permanent: true,
      },
      {
        source: "/about-us",
        destination: "/about",
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
