import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: path.resolve("."),
  },
  outputFileTracingRoot: path.resolve("."),
  experimental: {
    workerThreads: true,
    cpus: 1,
  },
  // The local sandbox blocks the child process Next uses for `tsc`.
  // Run `tsc --noEmit` separately; production builds keep type checking on.
  typescript: {
    ignoreBuildErrors: process.env.NEXT_IGNORE_TYPES === "1",
  },
};

export default nextConfig;
