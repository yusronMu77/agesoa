import path from "node:path";
import type { NextConfig } from "next";

// Monorepo root: the portal depends on the @agesoa/ui workspace package.
const monorepoRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
