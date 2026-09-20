import "server-only";
import type { Complex, RegionData, RentDeal, TradeDeal } from "./types";

/**
 * 공공데이터포털 — 국토교통부 오피스텔 실거래가 OpenAPI (매매 · 전월세).
 * 인증키는 서버 환경변수 DATA_GO_KR_KEY 에서만 읽는다. 브라우저로 나가지 않는다.
 * 호출 결과는 Next 데이터 캐시에 하루 보관한다 (revalidate 86400).
 */
const BASE = "https://apis.data.go.kr/1613000";
const RENT = `${BASE}/RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent`;
const TRADE = `${BASE}/RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade`;
const ROWS = 1000;
const MONTHS = 24;
const DAY = 86400;

export const hasDataGoKey = () => Boolean(process.env.DATA_GO_KR_KEY);

/** 포털은 Encoding/Decoding 두 형태의 키를 준다. 어느 쪽을 넣어도 동작하게 한다 */
function keyParam(): string {
  const k = process.env.DATA_GO_KR_KEY ?? "";
  return k.includes("%") ? k : encodeURIComponent(k);
}

/** <item>…</item> 블록을 {태그: 값} 으로. 이 API의 item은 1단계 평면 구조다 */
export function parseItems(xml: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    const rec: Record<string, string> = {};
    const tagRe = /<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g;
    let t: RegExpExecArray | null;
    while ((t = tagRe.exec(m[1]))) rec[t[1]] = t[2].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    out.push(rec);
  }
  return out;
}

export function parseHeader(xml: string): { code: string; msg: string; total: number } {
  const pick = (tag: string) => new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1]?.trim() ?? "";
  // 키 오류 등은 다른 봉투(OpenAPI_ServiceResponse)로 온다
  const authMsg = pick("returnAuthMsg");
  if (authMsg) return { code: pick("returnReasonCode") || "AUTH", msg: authMsg, total: 0 };
  return { code: pick("resultCode"), msg: pick("resultMsg"), total: Number(pick("totalCount") || 0) };
}

const num = (s: string | undefined) => {
  const v = Number((s ?? "").replace(/,/g, "").trim());
  return Number.isFinite(v) ? v : 0;
};

async function fetchMonth(url: string, lawd: string, ym: string): Promise<Record<string, string>[]> {
  const items: Record<string, string>[] = [];
  for (let page = 1; page <= 20; page++) {
    const u = `${url}?serviceKey=${keyParam()}&LAWD_CD=${lawd}&DEAL_YMD=${ym}&pageNo=${page}&numOfRows=${ROWS}`;
    const res = await fetch(u, { next: { revalidate: DAY } });
    const xml = await res.text();
    const h = parseHeader(xml);
    if (h.code !== "000" && h.code !== "00") throw new Error(`data.go.kr ${h.code} ${h.msg}`.trim());
    items.push(...parseItems(xml));
    if (page * ROWS >= h.total) break;
  }
  return items;
}

/** 서울 기준 오늘부터 과거 n개월의 YYYYMM */
export function lastMonths(n: number, now = new Date()): string[] {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const out: string[] = [];
  let y = kst.getUTCFullYear();
  let m = kst.getUTCMonth() + 1;
  for (let i = 0; i < n; i++) {
    out.push(`${y}${String(m).padStart(2, "0")}`);
    m--;
    if (m === 0) { m = 12; y--; }
  }
  return out;
}

async function pool<T>(tasks: (() => Promise<T>)[], size: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, tasks.length) }, async () => {
      while (next < tasks.length) {
        const k = next++;
        out[k] = await tasks[k]();
      }
    }),
  );
  return out;
}

export function buildRegion(
  rentItems: Record<string, string>[],
  tradeItems: Record<string, string>[],
): Pick<RegionData, "complexes" | "rent" | "trade"> {
  const complexes: Complex[] = [];
  const index = new Map<string, number>();
  const cxOf = (r: Record<string, string>) => {
    const name = r.offiNm ?? "";
    const dong = r.umdNm ?? "";
    const jibun = r.jibun ?? "";
    const key = `${dong}|${jibun}|${name}`;
    let i = index.get(key);
    if (i === undefined) {
      i = complexes.length;
      index.set(key, i);
      complexes.push({ key, name, dong, jibun, road: "", buildYear: num(r.buildYear) });
    }
    return i;
  };
  const ymd = (r: Record<string, string>) => num(r.dealYear) * 10000 + num(r.dealMonth) * 100 + num(r.dealDay);

  const rent: RentDeal[] = rentItems.map((r) => ({
    cx: cxOf(r), area: num(r.excluUseAr), ymd: ymd(r),
    deposit: num(r.deposit), rent: num(r.monthlyRent), floor: num(r.floor),
    ctype: r.contractType === "신규" ? 1 : r.contractType === "갱신" ? 2 : 0,
    rrr: r.useRRRight === "사용" ? 1 : 0,
    prevDeposit: num(r.preDeposit), prevRent: num(r.preMonthlyRent),
  }));
  const trade: TradeDeal[] = tradeItems.map((r) => ({
    cx: cxOf(r), area: num(r.excluUseAr), ymd: ymd(r), price: num(r.dealAmount), floor: num(r.floor),
    canceled: (r.cdealType ?? "").trim() || (r.cdealDay ?? "").trim() ? 1 : 0,
  }));
  return { complexes, rent: rent.filter((d) => d.area > 0), trade: trade.filter((d) => d.area > 0 && d.price > 0) };
}

export async function fetchLiveRegion(code: string, name: string): Promise<RegionData> {
  const months = lastMonths(MONTHS);
  const [rentByMonth, tradeByMonth] = await Promise.all([
    pool(months.map((ym) => () => fetchMonth(RENT, code, ym)), 6),
    pool(months.map((ym) => () => fetchMonth(TRADE, code, ym)), 6),
  ]);
  const built = buildRegion(rentByMonth.flat(), tradeByMonth.flat());
  const fmt = (ym: string, last = false) => `${ym.slice(0, 4)}-${ym.slice(4)}${last ? "" : "-01"}`;
  return {
    meta: {
      code, name, asset: "오피스텔", mode: "live",
      source: "공공데이터포털 · 국토교통부 오피스텔 매매/전월세 실거래가 OpenAPI",
      from: fmt(months[months.length - 1]), to: fmt(months[0], true),
      fetchedAt: new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10),
    },
    ...built,
  };
}
