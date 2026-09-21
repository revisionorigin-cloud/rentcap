import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RENTCAP — 임대주택 언더라이팅",
  description: "딜은 계산에서 틀리지 않습니다. 가정에서 틀립니다. 국토교통부 실거래가와 한국은행 금리로 가정을 채우고, 그 가정이 시장의 상위 몇 %인지 보여주는 오피스텔 통매입 언더라이팅.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
