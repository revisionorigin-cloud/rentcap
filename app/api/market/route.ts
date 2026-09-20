import { NextResponse, type NextRequest } from "next/server";
import { computeMarket } from "@/lib/market";
import { loadRegion } from "@/lib/source";
import { BANDS, type AreaBand } from "@/lib/types";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const bandParam = req.nextUrl.searchParams.get("band") ?? "all";
  const band = (BANDS.some((b) => b.id === bandParam) ? bandParam : "all") as AreaBand;
  if (!/^\d{5}$/.test(code)) return NextResponse.json({ error: "시군구 코드는 숫자 5자리입니다." }, { status: 400 });
  try {
    const data = await loadRegion(code);
    return NextResponse.json(computeMarket(data, band), {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회에 실패했습니다." }, { status: 502 });
  }
}
