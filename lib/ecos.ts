import "server-only";

/**
 * 한국은행 ECOS OpenAPI — 기준금리와 시장금리.
 * ECOS_API_KEY 가 없으면 한국은행이 공개한 시험용 키 "sample"(요청당 10행 제한)을 쓴다.
 * 그래서 조회 구간을 10행 이내로 잡는다: 일별은 최근 12일, 월별은 최근 8개월.
 */
export type Rate = { id: string; label: string; value: number; asOf: string };
export type Rates = { live: boolean; keyKind: "own" | "sample" | "none"; fetchedAt: string; rates: Rate[]; note?: string };

const DAY = 86400;
const SERIES = [
  { id: "base", label: "한국은행 기준금리", stat: "722Y001", cycle: "M", item: "0101000" },
  { id: "cd91", label: "CD 91일", stat: "817Y002", cycle: "D", item: "010502000" },
  { id: "ktb3", label: "국고채 3년", stat: "817Y002", cycle: "D", item: "010200000" },
  { id: "corpAA", label: "회사채 3년 AA-", stat: "817Y002", cycle: "D", item: "010300000" },
] as const;

// ECOS 장애 시 표시할 마지막 확인값 (2026-09-18 ECOS 조회). 화면에 "실시간 아님"으로 표기된다.
const FALLBACK: Rate[] = [
  { id: "base", label: "한국은행 기준금리", value: 3.0, asOf: "2026-08" },
  { id: "cd91", label: "CD 91일", value: 3.2, asOf: "2026-09-18" },
  { id: "ktb3", label: "국고채 3년", value: 4.035, asOf: "2026-09-18" },
  { id: "corpAA", label: "회사채 3년 AA-", value: 4.706, asOf: "2026-09-18" },
];

const pad = (n: number) => String(n).padStart(2, "0");

function range(cycle: "M" | "D", now: Date): [string, string] {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const end = new Date(kst);
  const start = new Date(kst);
  if (cycle === "D") {
    start.setUTCDate(start.getUTCDate() - 12);
    const f = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
    return [f(start), f(end)];
  }
  start.setUTCMonth(start.getUTCMonth() - 8);
  const f = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}`;
  return [f(start), f(end)];
}

const fmtTime = (t: string) => (t.length === 8 ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6)}` : `${t.slice(0, 4)}-${t.slice(4)}`);

export async function getRates(now = new Date()): Promise<Rates> {
  const key = process.env.ECOS_API_KEY || "sample";
  const fetchedAt = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  try {
    const rates = await Promise.all(
      SERIES.map(async (s): Promise<Rate> => {
        const [from, to] = range(s.cycle, now);
        const url = `https://ecos.bok.or.kr/api/StatisticSearch/${key}/json/kr/1/10/${s.stat}/${s.cycle}/${from}/${to}/${s.item}`;
        const res = await fetch(url, { next: { revalidate: DAY } });
        const json = (await res.json()) as { StatisticSearch?: { row?: { TIME: string; DATA_VALUE: string }[] } };
        const rows = json.StatisticSearch?.row ?? [];
        const last = rows[rows.length - 1];
        const value = Number(last?.DATA_VALUE);
        if (!last || !Number.isFinite(value)) throw new Error(`ECOS ${s.id} 응답 없음`);
        return { id: s.id, label: s.label, value, asOf: fmtTime(last.TIME) };
      }),
    );
    return { live: true, keyKind: process.env.ECOS_API_KEY ? "own" : "sample", fetchedAt, rates };
  } catch (e) {
    return {
      live: false, keyKind: "none", fetchedAt, rates: FALLBACK,
      note: `ECOS 호출 실패 — 마지막 확인값을 표시합니다 (${e instanceof Error ? e.message : "오류"}).`,
    };
  }
}
