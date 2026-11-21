import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const API = process.env.LINEREADY_API_URL || "http://localhost:8000";

const nextConfig = {
  reactStrictMode: true,
  // This app lives in web/; pin the root so a lockfile one level up is not mistaken for the workspace.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  // The Shift Brief screen became "Tonight" in the redesign; keep old links working.
  async redirects() {
    return [{ source: "/brief", destination: "/tonight", permanent: false }];
  },
  // Browser calls go to /backend/* and are proxied to the FastAPI service: no CORS, one origin.
  async rewrites() {
    return [{ source: "/backend/:path*", destination: `${API}/api/:path*` }];
  },
};

export default nextConfig;
