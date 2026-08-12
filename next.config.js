/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // 고객관리(단골 장부): 직원용 독립 페이지 (public/customers.html)
      { source: "/customers", destination: "/customers.html" },
      // 손님이 QR로 여는 도장 카드 (public/join.html)
      { source: "/join", destination: "/join.html" },
    ];
  },
};

module.exports = nextConfig;
