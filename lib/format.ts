const nf = (d: number) => new Intl.NumberFormat("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });

export const DASH = "–";

export function num(v: number | null | undefined, d = 0): string {
  return v === null || v === undefined || !Number.isFinite(v) ? DASH : nf(d).format(v);
}

/** 만원 → "억" 표기 */
export function eok(manwon: number | null | undefined, d = 1): string {
  return manwon === null || manwon === undefined || !Number.isFinite(manwon) ? DASH : `${nf(d).format(manwon / 10000)}억`;
}

/** 소수 → % */
export function pct(frac: number | null | undefined, d = 2): string {
  return frac === null || frac === undefined || !Number.isFinite(frac) ? DASH : `${nf(d).format(frac * 100)}%`;
}

/** 이미 % 단위인 값 */
export function pctv(v: number | null | undefined, d = 1, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return `${signed && v > 0 ? "+" : ""}${nf(d).format(v)}%`;
}

export function mult(v: number | null | undefined, d = 2): string {
  return v === null || v === undefined || !Number.isFinite(v) ? DASH : `${nf(d).format(v)}x`;
}

export function ymLabel(ym: number): string {
  return `${String(ym).slice(2, 4)}.${String(ym).slice(4)}`;
}

export function ymdLabel(ymd: number): string {
  const s = String(ymd);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
}
