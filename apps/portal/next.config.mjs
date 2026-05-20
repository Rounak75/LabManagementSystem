/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow importing from monorepo workspaces (esp. @lab/reports).
  transpilePackages: ["@lab/reports"]
};
export default nextConfig;
