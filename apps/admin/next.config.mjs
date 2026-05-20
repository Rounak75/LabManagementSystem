/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Dynamic routes (these all read cookies) default to staleTimes.dynamic = 0,
    // so the client router cache discards prefetched pages and every click does a
    // fresh server roundtrip — the main source of the navigation lag. Letting the
    // client reuse a prefetched/visited page for 30s makes navigation instant.
    // Server data is still unstable_cache'd + tag-revalidated, so writes stay fresh.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};
export default nextConfig;
