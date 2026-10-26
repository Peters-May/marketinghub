import { withWorkflow } from "workflow/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow larger media uploads (per-file) through App Router route handlers.
  experimental: {
    middlewareClientMaxBodySize: "30mb",
    proxyClientMaxBodySize: "30mb",
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "drive.google.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/app/social", destination: "/app/content", permanent: false },
      { source: "/app/media", destination: "/app/library", permanent: false },
      { source: "/app/brand", destination: "/app/library", permanent: false },
      {
        source: "/app/resources",
        destination: "/app/library",
        permanent: false,
      },
      { source: "/app/merch", destination: "/app/internal", permanent: false },
      {
        source: "/app/sponsorships",
        destination: "/app/partners",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    const protectedResource = "/api/mcp/oauth/metadata/protected-resource";
    const authorizationServer =
      "/api/mcp/oauth/metadata/authorization-server";

    return [
      // Root + path-aware discovery (ChatGPT prefers .../mcp and .../api/mcp suffixes).
      {
        source: "/.well-known/oauth-protected-resource",
        destination: protectedResource,
      },
      {
        source: "/.well-known/oauth-protected-resource/mcp",
        destination: protectedResource,
      },
      {
        source: "/.well-known/oauth-protected-resource/api/mcp",
        destination: protectedResource,
      },
      {
        source: "/.well-known/oauth-protected-resource/api/mcp/enquiries",
        destination: `${protectedResource}?resource=/api/mcp/enquiries`,
      },
      {
        source: "/api/mcp/enquiries/.well-known/oauth-protected-resource",
        destination: `${protectedResource}?resource=/api/mcp/enquiries`,
      },
      {
        source: "/api/mcp/.well-known/oauth-protected-resource",
        destination: protectedResource,
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: authorizationServer,
      },
      {
        source: "/.well-known/oauth-authorization-server/mcp",
        destination: authorizationServer,
      },
      {
        source: "/.well-known/oauth-authorization-server/api/mcp",
        destination: authorizationServer,
      },
      {
        source: "/.well-known/oauth-authorization-server/api/mcp/oauth",
        destination: authorizationServer,
      },
      {
        source: "/api/mcp/oauth/.well-known/oauth-authorization-server",
        destination: authorizationServer,
      },
    ];
  },
};

export default withWorkflow(nextConfig);
