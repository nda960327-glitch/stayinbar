/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // 고객관리(단골 장부): 로그인 없이 쓰는 독립 페이지 (public/customers.html)
    return [{ source: "/customers", destination: "/customers.html" }];
  },
};

module.exports = nextConfig;
