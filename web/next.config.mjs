import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app lives in web/; pin the root so a lockfile one level up is not mistaken for the workspace.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  // The Shift Brief screen became "Tonight" in the redesign; keep old links working.
  async redirects() {
    return [{ source: "/brief", destination: "/tonight", permanent: false }];
  },
  // Browser calls to /backend/* are proxied at runtime by src/app/backend/[...path]/route.ts.
  // Standalone output: a small self-contained server for the container image.
  output: "standalone",
};

export default nextConfig;
