import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@argonath/shared", "@argonath/ui"],
  serverExternalPackages: ["@argonath/api", "@argonath/db", "@prisma/client"],
};

export default nextConfig;
