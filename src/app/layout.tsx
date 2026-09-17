import "./globals.css";
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  // 브라우저에 다크/라이트를 직접 지원한다고 알려 폰 다크모드의 강제 색 변환(auto dark)을 막는다
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f6f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0d0b" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "STAY IN BAR · 리포트",
  description: "업무일지 기반 매출·급여 리포트",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Stay in Bar",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
