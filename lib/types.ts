// 금액 단위는 전부 만원. 면적은 ㎡(전용), "평"은 전용평(㎡ ÷ 3.3058).

export const PY = 3.3058;

export type Complex = {
  key: string; // `${dong}|${jibun}|${name}` — 실시간·스냅샷 공통 식별자
  name: string;
  dong: string;
  jibun: string;
  road: string;
  buildYear: number;
};

export type RentDeal = {
  cx: number; // complexes 배열 인덱스
  area: number;
  ymd: number; // 계약일 YYYYMMDD
  deposit: number;
  rent: number; // 월세. 0이면 전세
  floor: number;
  ctype: 0 | 1 | 2; // 0 미표기 · 1 신규 · 2 갱신
  rrr: 0 | 1; // 갱신요구권 사용
  prevDeposit: number;
  prevRent: number;
};

export type TradeDeal = {
  cx: number;
  area: number;
  ymd: number;
  price: number;
  floor: number;
  canceled: 0 | 1; // 해제 신고된 거래
};

export type SourceMeta = {
  code: string;
  name: string;
  asset: string;
  mode: "live" | "snapshot";
  source: string;
  from: string;
  to: string;
  fetchedAt: string;
  note?: string;
};

export type RegionData = {
  meta: SourceMeta;
  complexes: Complex[];
  rent: RentDeal[];
  trade: TradeDeal[];
};

export type AreaBand = "all" | "s" | "m" | "l" | "xl";

export const BANDS: { id: AreaBand; label: string; min: number; max: number }[] = [
  { id: "all", label: "전체", min: 0, max: 1e9 },
  { id: "s", label: "~20㎡", min: 0, max: 20 },
  { id: "m", label: "20~30㎡", min: 20, max: 30 },
  { id: "l", label: "30~45㎡", min: 30, max: 45 },
  { id: "xl", label: "45㎡~", min: 45, max: 1e9 },
];
