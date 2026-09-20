/** 순현재가치. cfs[0]은 t=0 */
export function npv(rate: number, cfs: number[]): number {
  let v = 0;
  for (let t = 0; t < cfs.length; t++) v += cfs[t] / Math.pow(1 + rate, t);
  return v;
}

/**
 * 내부수익률 — 이분법. 부호 변화가 없으면(전부 +거나 전부 −) null.
 * 탐색 구간은 −99% ~ +1000%. 구간 안에 근이 없으면 null.
 */
export function irr(cfs: number[]): number | null {
  const hasNeg = cfs.some((c) => c < 0);
  const hasPos = cfs.some((c) => c > 0);
  if (!hasNeg || !hasPos) return null;
  let lo = -0.99;
  let hi = 10;
  let fLo = npv(lo, cfs);
  const fHi = npv(hi, cfs);
  if (fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, cfs);
    if (Math.abs(fMid) < 1e-9) return mid;
    if (fLo * fMid <= 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * solve의 안전판. 구간을 steps 등분해 f가 유한하고 target을 사이에 둔 첫 구간을 찾은 뒤 그 안에서 이분법을 돈다.
 * 구간 끝에서 f가 정의되지 않는 경우(IRR 산출 불가 등)에 쓴다.
 */
export function solveScan(f: (x: number) => number, target: number, lo: number, hi: number, steps = 60): number | null {
  let px = lo;
  let pf = f(lo) - target;
  for (let k = 1; k <= steps; k++) {
    const x = lo + ((hi - lo) * k) / steps;
    const fx = f(x) - target;
    if (Number.isFinite(pf) && Number.isFinite(fx) && pf * fx <= 0) return solve(f, target, px, x);
    px = x;
    pf = fx;
  }
  return null;
}

/**
 * f(x) = target 이 되는 x를 이분법으로 찾는다. f가 구간에서 단조라고 가정.
 * 구간 양끝에서 target을 사이에 두지 못하면 null.
 */
export function solve(f: (x: number) => number, target: number, lo: number, hi: number): number | null {
  let a = lo;
  let b = hi;
  let fa = f(a) - target;
  const fb = f(b) - target;
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || fa * fb > 0) return null;
  for (let i = 0; i < 100; i++) {
    const m = (a + b) / 2;
    const fm = f(m) - target;
    if (!Number.isFinite(fm)) return null;
    if (fa * fm <= 0) {
      b = m;
    } else {
      a = m;
      fa = fm;
    }
  }
  return (a + b) / 2;
}
