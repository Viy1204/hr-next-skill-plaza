import type { NextConfig } from "next";

const config: NextConfig = {
  typedRoutes: true,
  // 部署机只有 1.9G 内存且已被别的服务占掉大半，next build 在上面必 OOM。
  // standalone 产物自带精简 node_modules，构建在别处做，服务器只跑 server.js。
  output: "standalone",
  // 开发机上层目录有别的 lockfile，Next 会把工作区根推断到那里，产物于是多套一层
  // 目录、还捎带无关文件。构建一律在仓库根跑，这里把根钉死。
  outputFileTracingRoot: process.cwd(),
};

export default config;
