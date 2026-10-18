import type { NextConfig } from "next";
const api = process.env.API_INTERNAL_ORIGIN || "http://localhost:8000";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: "/api/v2/:path*", destination: `${api}/api/v2/:path*` },
      { source: "/.well-known/quantumpass-keys.json",
        destination: `${api}/.well-known/quantumpass-keys.json` },
    ];
  },
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    const noStore = [{ key: "Cache-Control", value: "no-store, max-age=0" }];
    return [
      { source: "/:path*", headers: security },
      { source: "/generate", headers: noStore },
      { source: "/verify/:path*", headers: noStore },
      { source: "/draws", headers: noStore },
      { source: "/dashboard/:path*", headers: noStore },
      { source: "/admin/:path*", headers: noStore },
    ];
  },
};
export default config;
