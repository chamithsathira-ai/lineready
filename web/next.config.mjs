/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Shift Brief screen became "Tonight" in the redesign; keep old links working.
  async redirects() {
    return [{ source: "/brief", destination: "/tonight", permanent: false }];
  },
};

export default nextConfig;
