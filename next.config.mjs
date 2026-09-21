/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 本地开发联调旧后端：把 /api/* 反代到 8787（node:http+SQLite 服务）。
  // 生产环境由 nginx 的 location /api/ 直接转发，此处 rewrite 不会生效，互不影响。
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8787/api/:path*",
      },
    ];
  },
};

export default nextConfig;
