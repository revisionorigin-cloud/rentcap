import { median, quantileSorted, quantileTable, sortAsc, trim } from "./stats";
import { BANDS, PY, type AreaBand, type RegionData, type RentDeal, type SourceMeta } from "./types";

/** 전환율을 데이터에서 추정하지 못할 때 쓰는 값. 화면에 "기본값"이라고 표시한다 */
export const DEFAULT_CONV_PCT = 5.5;

export type ConvEstimate = {
  ratePct: number;
  n: number; // 추정에 쓴 월세 계약 수
  p25: number | null;
  p75: number | null;
  method: "implied" | "default";
};

export type ComplexStat = {
  key: string;
  name: string;
  dong: string;
  buildYear: number;
  nRent: number;
  nWolse: number;
  nTrade: number;
  medArea: number;
  effRentPerPy: number | null; // 신규 월세 기준 환산월세 (표본 부족 시 전체 월세)
  rentBasis: "new" | "all" | null;
  effRentRenew: number | null;
  gapPct: number | null; // (신규 ÷ 갱신 − 1) — 양수면 기존 임차인이 시세보다 싸게 살고 있다
  pricePerPy: number | null;
  grossYieldPct: number | null;
  yieldBasis: "matched" | "perpy" | null; // matched = 같은 타입(전용㎡)끼리 임대·매매를 맞춘 값
  medDeposit: number | null;
  medRent: number | null;
};

export type MonthPoint = { ym: number; rent: number | null; rentN: number; price: number | null; priceN: number };

export type Market = {
  meta: SourceMeta;
  band: AreaBand;
  window: { recentFrom: number; latest: number; priorFrom: number };
  counts: {
    rentTotal: number; rentInBand: number; rentRecent: number; wolseRecent: number;
    tradeTotal: number; tradeCanceled: number; tradeInBand: number; tradeRecent: number;
    complexes: number; complexesListed: number;
  };
  conv: ConvEstimate;
  kpi: {
    effRentPerPy: number | null; effRentN: number;
    pricePerPy: number | null; priceN: number;
    grossYieldPct: number | null; yieldN: number;
    gapPct: number | null; gapN: number;
    rentYoYPct: number | null; rentYoYN: number;
    priceYoYPct: number | null; priceYoYN: number;
    renewIncrPct: number | null; renewN: number; renewAtCapShare: number | null;
    rrrShare: number | null;
    wolseShare: number | null;
    depositToPricePct: number | null;
    medAreaM2: number | null; // 최근 12개월 임대 계약의 전용면적 중앙값
  };
  tables: { price: number[]; rent: number[]; yield: number[] };
  series: MonthPoint[];
  complexes: ComplexStat[];
};

const minusYear = (ymd: number, k = 1) => ymd - 10000 * k;

/**
 * 시장 전월세전환율 추정.
 * 같은 단지·같은 면적(㎡ 반올림)에서 전세 보증금 중앙값 J를 구하고,
 * 월세 계약마다 r = 월세×12 ÷ (J − 보증금) 을 계산해 지역 중앙값을 쓴다.
 * 이상치 방지: J 표본 2건 이상, J − 보증금 ≥ 500만원, 2% < r < 12%. 유효 표본 30건 미만이면 기본값.
 */
export function estimateConversion(rent: RentDeal[], from: number): ConvEstimate {
  const groups = new Map<string, { j: number[]; w: RentDeal[] }>();
  for (const d of rent) {
    if (d.ymd <= from) continue;
    const k = `${d.cx}:${Math.round(d.area)}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { j: [], w: [] }));
    if (d.rent === 0) g.j.push(d.deposit);
    else g.w.push(d);
  }
  const rs: number[] = [];
  for (const g of groups.values()) {
    if (g.j.length < 2 || g.w.length === 0) continue;
    const J = median(g.j);
    for (const d of g.w) {
      const diff = J - d.deposit;
      if (diff < 500) continue;
      const r = (d.rent * 12) / diff;
      if (r > 0.02 && r < 0.12) rs.push(r * 100);
    }
  }
  if (rs.length < 30) return { ratePct: DEFAULT_CONV_PCT, n: rs.length, p25: null, p75: null, method: "default" };
  const s = sortAsc(rs);
  return {
    ratePct: Math.round(quantileSorted(s, 0.5) * 100) / 100,
    n: rs.length,
    p25: quantileSorted(s, 0.25),
    p75: quantileSorted(s, 0.75),
    method: "implied",
  };
}

/** 환산월세(만원/전용평·월) = (월세 + 보증금 × 전환율 ÷ 12) ÷ 전용평 */
export function effRentPerPy(deposit: number, rent: number, area: number, convPct: number): number {
  return (rent + (deposit * convPct) / 100 / 12) / (area / PY);
}

const medOrNull = (xs: number[], min = 1) => (xs.length >= min ? median(xs) : null);

export function computeMarket(data: RegionData, band: AreaBand = "all"): Market {
  const b = BANDS.find((x) => x.id === band) ?? BANDS[0];
  const inBand = (a: number) => a >= b.min && a < b.max;

  const latest = Math.max(0, ...data.rent.map((d) => d.ymd), ...data.trade.map((d) => d.ymd));
  const recentFrom = minusYear(latest);
  const priorFrom = minusYear(latest, 2);

  // 전환율은 면적대와 무관하게 지역 전체로 추정한다 (표본 확보)
  const conv = estimateConversion(data.rent, recentFrom);
  const eff = (d: RentDeal) => effRentPerPy(d.deposit, d.rent, d.area, conv.ratePct);

  const rentB = data.rent.filter((d) => inBand(d.area));
  const tradeAllB = data.trade.filter((d) => inBand(d.area));
  const tradeB = tradeAllB.filter((d) => !d.canceled);
  const rentRecent = rentB.filter((d) => d.ymd > recentFrom);
  const wolseRecent = rentRecent.filter((d) => d.rent > 0);
  const tradeRecent = tradeB.filter((d) => d.ymd > recentFrom);

  const priceVals = trim(tradeRecent.map((d) => d.price / (d.area / PY)));
  const newWolse = wolseRecent.filter((d) => d.ctype !== 2);
  const rentVals = trim(newWolse.map(eff));

  // ── 단지별 통계
  type Acc = {
    rentAll: RentDeal[]; wNew: number[]; wRenew: number[]; wAll: number[]; wPrior: number[];
    price: number[]; pricePrior: number[]; areas: number[]; dep: number[]; mr: number[];
    byType: Map<number, { rent: number[]; price: number[] }>; // 타입별 세대당 환산월세(만원/월) · 매매가(만원)
  };
  const acc = new Map<number, Acc>();
  const get = (cx: number) => {
    let a = acc.get(cx);
    if (!a) acc.set(cx, (a = { rentAll: [], wNew: [], wRenew: [], wAll: [], wPrior: [], price: [], pricePrior: [], areas: [], dep: [], mr: [], byType: new Map() }));
    return a;
  };
  const typeOf = (a: Acc, area: number) => {
    const k = Math.round(area);
    let t = a.byType.get(k);
    if (!t) a.byType.set(k, (t = { rent: [], price: [] }));
    return t;
  };
  for (const d of rentB) {
    if (d.ymd > recentFrom) {
      const a = get(d.cx);
      a.rentAll.push(d);
      a.areas.push(d.area);
      if (d.rent > 0) {
        const e = eff(d);
        a.wAll.push(e);
        (d.ctype === 2 ? a.wRenew : a.wNew).push(e);
        if (d.ctype !== 2) typeOf(a, d.area).rent.push(d.rent + (d.deposit * conv.ratePct) / 100 / 12);
        a.dep.push(d.deposit);
        a.mr.push(d.rent);
      }
    } else if (d.ymd > priorFrom && d.rent > 0 && d.ctype !== 2) {
      get(d.cx).wPrior.push(eff(d));
    }
  }
  for (const d of tradeB) {
    const v = d.price / (d.area / PY);
    if (d.ymd > recentFrom) {
      const a = get(d.cx);
      a.price.push(v);
      typeOf(a, d.area).price.push(d.price);
    } else if (d.ymd > priorFrom) get(d.cx).pricePrior.push(v);
  }

  const complexes: ComplexStat[] = [];
  const yields: number[] = [];
  const gaps: number[] = [];
  const rentYoY: number[] = [];
  const priceYoY: number[] = [];
  for (const [cx, a] of acc) {
    const c = data.complexes[cx];
    if (!c) continue;
    const basis: "new" | "all" | null = a.wNew.length >= 3 ? "new" : a.wAll.length >= 3 ? "all" : null;
    const rentMed = basis === "new" ? median(a.wNew) : basis === "all" ? median(a.wAll) : null;
    const renewMed = medOrNull(a.wRenew, 3);
    const priceMed = medOrNull(a.price, 3);
    // 수익률: 같은 타입끼리 (임대 2건·매매 2건 이상) 맞춰 거래량 가중평균. 맞는 타입이 없을 때만 평당 비율로 대체
    let wSum = 0;
    let ySum = 0;
    for (const t of a.byType.values()) {
      if (t.rent.length < 2 || t.price.length < 2) continue;
      const w = t.rent.length + t.price.length;
      ySum += ((median(t.rent) * 12) / median(t.price)) * 100 * w;
      wSum += w;
    }
    const gy = wSum > 0 ? ySum / wSum : rentMed !== null && priceMed !== null ? ((rentMed * 12) / priceMed) * 100 : null;
    const yieldBasis: "matched" | "perpy" | null = wSum > 0 ? "matched" : gy !== null ? "perpy" : null;
    const gap = a.wNew.length >= 3 && renewMed !== null ? (median(a.wNew) / renewMed - 1) * 100 : null;
    if (gy !== null) yields.push(gy);
    if (gap !== null) gaps.push(gap);
    if (a.wNew.length >= 5 && a.wPrior.length >= 5) rentYoY.push((median(a.wNew) / median(a.wPrior) - 1) * 100);
    if (a.price.length >= 3 && a.pricePrior.length >= 3) priceYoY.push((median(a.price) / median(a.pricePrior) - 1) * 100);
    if (a.rentAll.length >= 5) {
      complexes.push({
        key: c.key, name: c.name, dong: c.dong, buildYear: c.buildYear,
        nRent: a.rentAll.length, nWolse: a.wAll.length, nTrade: a.price.length,
        medArea: median(a.areas), effRentPerPy: rentMed, rentBasis: basis, effRentRenew: renewMed,
        gapPct: gap, pricePerPy: priceMed, grossYieldPct: gy, yieldBasis,
        medDeposit: medOrNull(a.dep), medRent: medOrNull(a.mr),
      });
    }
  }
  complexes.sort((x, y) => y.nRent - x.nRent);

  // ── 갱신 계약의 임대료 인상률 (종전 계약 대비, 환산월세 기준)
  const renewIncr: number[] = [];
  let rrrUsed = 0;
  let renewCount = 0;
  for (const d of rentRecent) {
    if (d.ctype !== 2) continue;
    renewCount++;
    if (d.rrr) rrrUsed++;
    if (d.prevDeposit > 0 || d.prevRent > 0) {
      const now = d.rent + (d.deposit * conv.ratePct) / 100 / 12;
      const prev = d.prevRent + (d.prevDeposit * conv.ratePct) / 100 / 12;
      if (prev > 0) renewIncr.push((now / prev - 1) * 100);
    }
  }
  const renewTrim = trim(renewIncr);

  // ── 월별 시계열 (24개월)
  const byMonth = new Map<number, { r: number[]; p: number[] }>();
  const mget = (ym: number) => {
    let m = byMonth.get(ym);
    if (!m) byMonth.set(ym, (m = { r: [], p: [] }));
    return m;
  };
  for (const d of rentB) if (d.ymd > priorFrom && d.rent > 0 && d.ctype !== 2) mget(Math.floor(d.ymd / 100)).r.push(eff(d));
  for (const d of tradeB) if (d.ymd > priorFrom) mget(Math.floor(d.ymd / 100)).p.push(d.price / (d.area / PY));
  const series: MonthPoint[] = [...byMonth.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([ym, m]) => ({ ym, rent: medOrNull(m.r, 5), rentN: m.r.length, price: medOrNull(m.p, 3), priceN: m.p.length }));

  const depToPrice: number[] = [];
  for (const c of complexes) if (c.medDeposit !== null && c.pricePerPy !== null) depToPrice.push((c.medDeposit / (c.pricePerPy * (c.medArea / PY))) * 100);

  return {
    meta: data.meta,
    band,
    window: { recentFrom, latest, priorFrom },
    counts: {
      rentTotal: data.rent.length, rentInBand: rentB.length, rentRecent: rentRecent.length, wolseRecent: wolseRecent.length,
      tradeTotal: data.trade.length, tradeCanceled: data.trade.filter((d) => d.canceled).length,
      tradeInBand: tradeB.length, tradeRecent: tradeRecent.length,
      complexes: acc.size, complexesListed: complexes.length,
    },
    conv,
    kpi: {
      effRentPerPy: medOrNull(rentVals, 5), effRentN: rentVals.length,
      pricePerPy: medOrNull(priceVals, 3), priceN: priceVals.length,
      grossYieldPct: medOrNull(yields, 3), yieldN: yields.length,
      gapPct: medOrNull(gaps, 3), gapN: gaps.length,
      rentYoYPct: medOrNull(rentYoY, 3), rentYoYN: rentYoY.length,
      priceYoYPct: medOrNull(priceYoY, 3), priceYoYN: priceYoY.length,
      renewIncrPct: medOrNull(renewTrim, 5), renewN: renewTrim.length,
      renewAtCapShare: renewTrim.length >= 5 ? renewTrim.filter((x) => x >= 4.5).length / renewTrim.length : null,
      rrrShare: renewCount > 0 ? rrrUsed / renewCount : null,
      wolseShare: rentRecent.length > 0 ? wolseRecent.length / rentRecent.length : null,
      depositToPricePct: medOrNull(depToPrice, 3),
      medAreaM2: medOrNull(rentRecent.map((d) => d.area), 5),
    },
    tables: { price: quantileTable(priceVals), rent: quantileTable(rentVals), yield: quantileTable(yields) },
    series,
    complexes: complexes.slice(0, 400),
  };
}

// ── 단지 상세

export type UnitType = {
  area: number; // ㎡ 반올림
  nRent: number;
  nWolse: number;
  medDeposit: number | null;
  medRent: number | null;
  effRentPerPy: number | null;
  nTrade: number;
  medPrice: number | null;
  pricePerPy: number | null;
};

export type ComplexDetail = {
  key: string; name: string; dong: string; jibun: string; road: string; buildYear: number;
  convPct: number;
  types: UnitType[];
  rentPoints: { ymd: number; v: number; ctype: 0 | 1 | 2; area: number }[];
  tradePoints: { ymd: number; v: number; area: number }[];
};

export function complexDetail(data: RegionData, key: string): ComplexDetail | null {
  const cx = data.complexes.findIndex((c) => c.key === key);
  if (cx < 0) return null;
  const c = data.complexes[cx];
  const latest = Math.max(0, ...data.rent.map((d) => d.ymd), ...data.trade.map((d) => d.ymd));
  const recentFrom = minusYear(latest);
  const conv = estimateConversion(data.rent, recentFrom);
  const rents = data.rent.filter((d) => d.cx === cx);
  const trades = data.trade.filter((d) => d.cx === cx && !d.canceled);

  const byType = new Map<number, { dep: number[]; mr: number[]; eff: number[]; n: number; price: number[]; ppy: number[] }>();
  const tget = (a: number) => {
    let t = byType.get(a);
    if (!t) byType.set(a, (t = { dep: [], mr: [], eff: [], n: 0, price: [], ppy: [] }));
    return t;
  };
  for (const d of rents) {
    if (d.ymd <= recentFrom) continue;
    const t = tget(Math.round(d.area));
    t.n++;
    if (d.rent > 0) {
      t.dep.push(d.deposit);
      t.mr.push(d.rent);
      t.eff.push(effRentPerPy(d.deposit, d.rent, d.area, conv.ratePct));
    }
  }
  for (const d of trades) {
    if (d.ymd <= recentFrom) continue;
    const t = tget(Math.round(d.area));
    t.price.push(d.price);
    t.ppy.push(d.price / (d.area / PY));
  }
  const types: UnitType[] = [...byType.entries()]
    .map(([area, t]) => ({
      area, nRent: t.n, nWolse: t.mr.length,
      medDeposit: medOrNull(t.dep), medRent: medOrNull(t.mr), effRentPerPy: medOrNull(t.eff),
      nTrade: t.price.length, medPrice: medOrNull(t.price), pricePerPy: medOrNull(t.ppy),
    }))
    .sort((x, y) => y.nRent - x.nRent)
    .slice(0, 8);

  return {
    key: c.key, name: c.name, dong: c.dong, jibun: c.jibun, road: c.road, buildYear: c.buildYear,
    convPct: conv.ratePct,
    types,
    rentPoints: rents.filter((d) => d.rent > 0).map((d) => ({ ymd: d.ymd, v: effRentPerPy(d.deposit, d.rent, d.area, conv.ratePct), ctype: d.ctype, area: d.area })),
    tradePoints: trades.map((d) => ({ ymd: d.ymd, v: d.price / (d.area / PY), area: d.area })),
  };
}
