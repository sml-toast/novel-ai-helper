/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // sql.js 依赖 wasm，交给 Node 运行时在 node_modules 里按需加载，不要被打包
  serverExternalPackages: ["sql.js"],
};

export default nextConfig;
