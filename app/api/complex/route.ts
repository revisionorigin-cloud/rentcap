import { NextResponse, type NextRequest } from "next/server";
import { complexDetail } from "@/lib/market";
import { loadRegion } from "@/lib/source";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!/^\d{5}$/.test(code) || !key) return NextResponse.json({ error: "code와 key가 필요합니다." }, { status: 400 });
  try {
    const detail = complexDetail(await loadRegion(code), key);
    if (!detail) return NextResponse.json({ error: "단지를 찾지 못했습니다." }, { status: 404 });
    return NextResponse.json(detail, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회에 실패했습니다." }, { status: 502 });
  }
}
