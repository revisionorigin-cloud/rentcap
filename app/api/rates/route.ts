import { NextResponse, type NextRequest } from "next/server";
import { getRates } from "@/lib/ecos";

export async function GET(req: NextRequest) {
  void req.nextUrl.search; // 요청 시점에 평가 — 빌드 때 ECOS를 부르지 않는다
  return NextResponse.json(await getRates(), {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
