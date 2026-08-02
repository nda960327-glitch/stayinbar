import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "STAY IN BAR · 리포트",
  description: "업무일지 기반 매출·급여 리포트",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
