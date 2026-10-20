import path from "node:path";
import type { NextConfig } from "next";
import { LEGACY_REDIRECTS } from "./src/lib/routes";

// Monorepo root: the portal depends on the @agesoa/ui workspace package.
const monorepoRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  poweredByHeader: false,
  reactStrictMode: true,
  // Old portal paths stay alive for links, E2E evidence and documents: permanent 308 to the current route (query
  // strings pass through; the Location is the relative destination path). Table: src/lib/routes.ts.
  async redirects() {
    return LEGACY_REDIRECTS.map(({ source, destination }) => ({ source, destination, permanent: true }));
  },
};

export default nextConfig;
