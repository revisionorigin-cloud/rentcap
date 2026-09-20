export function sortAsc(xs: number[]): number[] {
  return [...xs].sort((a, b) => a - b);
}

/** 정렬된 배열의 분위수 (선형보간). 빈 배열이면 NaN */
export function quantileSorted(sorted: number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const pos = (n - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(xs: number[]): number {
  return quantileSorted(sortAsc(xs), 0.5);
}

/** 1~99 분위 밖을 잘라낸다 (입력 오류·특수거래 제거). 표본 20건 미만이면 그대로 둔다 */
export function trim(xs: number[], lo = 0.01, hi = 0.99): number[] {
  if (xs.length < 20) return xs;
  const s = sortAsc(xs);
  const a = quantileSorted(s, lo);
  const b = quantileSorted(s, hi);
  return xs.filter((x) => x >= a && x <= b);
}

/** 5% 간격 21개 분위수 표 — 클라이언트가 "시장 대비 위치"를 계산하는 데 쓴다 */
export function quantileTable(xs: number[]): number[] {
  const s = sortAsc(xs);
  if (s.length === 0) return [];
  return Array.from({ length: 21 }, (_, i) => quantileSorted(s, i / 20));
}

/** 분위수 표에서 값 v의 백분위(0~100)를 선형보간으로 구한다 */
export function percentileFromTable(table: number[], v: number): number | null {
  if (table.length !== 21 || !Number.isFinite(v)) return null;
  if (v <= table[0]) return 0;
  if (v >= table[20]) return 100;
  for (let i = 0; i < 20; i++) {
    const a = table[i];
    const b = table[i + 1];
    if (v >= a && v <= b) {
      const t = b === a ? 0 : (v - a) / (b - a);
      return (i + t) * 5;
    }
  }
  return null;
}
