"use client";

import dynamic from "next/dynamic";

// 첫 상태를 주소창(공유 링크)에서 읽으므로 서버에서 미리 그리지 않는다
const App = dynamic(() => import("./App"), {
  ssr: false,
  loading: () => <div className="boot">RENTCAP</div>,
});

export default function ClientApp() {
  return <App />;
}
