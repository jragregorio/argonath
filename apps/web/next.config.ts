import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@warden/shared", "@warden/ui"],
  serverExternalPackages: ["@warden/api", "@warden/db", "@prisma/client"],
};

export default nextConfig;
