import type { ComplexStat, Market } from "./market";
import { percentileFromTable } from "./stats";
import { PY } from "./types";
import { underwrite, type UWInput } from "./underwrite";

/** 시장 데이터가 말해주지 않는 항목의 출발값. 화면에서 전부 "가정"으로 표시되고 사용자가 고친다 */
export const BASE_INPUT: UWInput = {
  units: 120, areaPy: 8, pricePerPy: 2900, acqTaxPct: 4.6, acqCostPct: 1.0,
  effRentPerPy: 13.3, depositPerUnit: 1000, convRatePct: 5.8,
  vacancyPct: 5, opexPct: 15, capexPct: 2, holdTaxPct: 0.25, rentGrowthPct: 2,
  ltvPct: 50, baseRatePct: 3.2, spreadBp: 200, holdYears: 5, exitCapPct: 4.75, saleCostPct: 1.0,
  taxMode: "conduit", corpTaxPct: 22, buildingRatioPct: 40, deprYears: 40,
};

/** 대출 + 승계 보증금이 매입가에서 차지하는 비중의 상한. 자동 채우기에서만 쓰고 사용자가 고칠 수 있다 */
export const EFF_LTV_CAP = 70;

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type Provenance = Partial<Record<keyof UWInput, string>>;

/**
 * 시장(지역 또는 단지) 통계로 가정을 채운다. 어떤 값이 어디서 왔는지 provenance에 남긴다.
 * Exit Cap은 "진입 Cap + 25bp"로 둔다 — 보유 중 Cap이 좁혀진다고 가정하지 않는 보수적 관행.
 */
export function suggest(prev: UWInput, m: Market, c: ComplexStat | null): { input: UWInput; from: Provenance } {
  const from: Provenance = {};
  const next: UWInput = { ...prev };
  const scope = c ? `${c.name}` : `${m.meta.name}`;

  const price = c?.pricePerPy ?? m.kpi.pricePerPy;
  if (price) {
    next.pricePerPy = round(price, 0);
    from.pricePerPy = c?.pricePerPy ? `${scope} 최근 12개월 매매 중앙값 (${c.nTrade}건)` : `${m.meta.name} 매매 중앙값 (${m.kpi.priceN}건)${c ? " — 단지 매매 3건 미만" : ""}`;
  }
  const rent = c?.effRentPerPy ?? m.kpi.effRentPerPy;
  if (rent) {
    next.effRentPerPy = round(rent, 2);
    from.effRentPerPy = c?.effRentPerPy
      ? `${scope} ${c.rentBasis === "new" ? "신규" : "전체"} 월세 환산 중앙값 (${c.nWolse}건)`
      : `${m.meta.name} 신규 월세 환산 중앙값 (${m.kpi.effRentN}건)`;
  }
  if (c) {
    next.areaPy = round(c.medArea / PY, 2);
    from.areaPy = `${scope} 임대 계약 전용면적 중앙값 ${c.medArea.toFixed(1)}㎡`;
    if (c.medDeposit !== null) {
      next.depositPerUnit = round(c.medDeposit, 0);
      from.depositPerUnit = `${scope} 월세 계약 보증금 중앙값`;
    }
  } else {
    if (m.kpi.medAreaM2 != null) {
      next.areaPy = round(m.kpi.medAreaM2 / PY, 2);
      from.areaPy = `${m.meta.name} 임대 계약 전용면적 중앙값 ${m.kpi.medAreaM2.toFixed(1)}㎡`;
    }
    if (m.kpi.depositToPricePct != null) {
      next.depositPerUnit = Math.round((next.pricePerPy * next.areaPy * m.kpi.depositToPricePct) / 100 / 100) * 100;
      from.depositPerUnit = `${m.meta.name} 단지별 매매가 대비 보증금 중앙값 ${m.kpi.depositToPricePct.toFixed(1)}%`;
    }
  }

  // 보증금이 큰 단지(반전세)에서는 대출 여력이 준다. 보증금 포함 실질 LTV가 70%를 넘지 않게 대출을 낮춘다
  const unitPrice = next.pricePerPy * next.areaPy;
  if (unitPrice > 0) {
    const depShare = ((next.depositPerUnit * (1 - next.vacancyPct / 100)) / unitPrice) * 100;
    const room = Math.max(0, Math.floor((EFF_LTV_CAP - depShare) / 5) * 5);
    const wanted = Math.max(prev.ltvPct, BASE_INPUT.ltvPct);
    next.ltvPct = Math.min(wanted, room);
    if (next.ltvPct < wanted) from.ltvPct = `승계 보증금이 매입가의 ${depShare.toFixed(0)}% — 실질 LTV ${EFF_LTV_CAP}% 안에 들도록 ${wanted}% → ${next.ltvPct}%로 낮춤`;
  }
  next.convRatePct = m.conv.ratePct;
  from.convRatePct = m.conv.method === "implied" ? `${m.meta.name} 전세·월세 쌍 ${m.conv.n.toLocaleString()}건에서 역산` : "표본 부족 — 기본값";
  if (m.kpi.rentYoYPct != null) {
    next.rentGrowthPct = round(clamp(m.kpi.rentYoYPct, 0, 4), 1);
    from.rentGrowthPct = `동일 단지 신규 월세 전년비 ${m.kpi.rentYoYPct.toFixed(1)}% (${m.kpi.rentYoYN}개 단지) — 0~4% 범위로 제한`;
  }

  const goingIn = underwrite(next).goingInCap;
  if (Number.isFinite(goingIn) && goingIn > 0) {
    next.exitCapPct = round(goingIn * 100 + 0.25, 2);
    from.exitCapPct = `진입 Cap ${(goingIn * 100).toFixed(2)}% + 25bp`;
  }
  return { input: next, from };
}

export type Stance = "aggressive" | "neutral" | "conservative" | "na";
export type Position = { stance: Stance; text: string };

const stanceLabel: Record<Stance, string> = { aggressive: "공격적", neutral: "중립", conservative: "보수적", na: "자료 없음" };
export const stanceText = (s: Stance) => stanceLabel[s];

/**
 * 각 가정이 시장 대비 어디에 있는지 판정한다. "공격적" = 수익률에 유리하지만 실현이 어려운 쪽.
 * 공공데이터로 확인할 수 없는 항목은 추정하지 않고 "자료 없음"으로 둔다.
 */
export function positions(i: UWInput, m: Market | null, allInRatePct: number, corpAAPct: number | null): Partial<Record<keyof UWInput | "allInRate", Position>> {
  const out: Partial<Record<keyof UWInput | "allInRate", Position>> = {};
  if (!m) return out;

  const pp = percentileFromTable(m.tables.price, i.pricePerPy);
  if (pp !== null) out.pricePerPy = { stance: "neutral", text: `시장 매매 단가의 P${Math.round(pp)} (${m.kpi.priceN}건)` };

  const rp = percentileFromTable(m.tables.rent, i.effRentPerPy);
  if (rp !== null) {
    out.effRentPerPy = {
      stance: rp > 75 ? "aggressive" : rp < 40 ? "conservative" : "neutral",
      text: `시장 신규 월세의 P${Math.round(rp)} (${m.kpi.effRentN}건)`,
    };
  }
  if (m.kpi.rentYoYPct !== null) {
    const d = i.rentGrowthPct - m.kpi.rentYoYPct;
    out.rentGrowthPct = {
      stance: d > 0.5 ? "aggressive" : d < -0.5 ? "conservative" : "neutral",
      text: `동일 단지 실측 ${m.kpi.rentYoYPct.toFixed(1)}%/년 대비 ${d >= 0 ? "+" : ""}${d.toFixed(1)}%p`,
    };
  }
  {
    const d = i.convRatePct - m.conv.ratePct;
    out.convRatePct = {
      stance: Math.abs(d) <= 0.3 ? "neutral" : d > 0 ? "aggressive" : "conservative",
      text: m.conv.method === "implied" ? `시장 역산 ${m.conv.ratePct.toFixed(2)}% (IQR ${m.conv.p25?.toFixed(1)}~${m.conv.p75?.toFixed(1)}%)` : "시장 표본 부족",
    };
  }
  const r = underwrite(i);
  if (Number.isFinite(r.goingInCap)) {
    const d = i.exitCapPct - r.goingInCap * 100;
    out.exitCapPct = {
      stance: d < 0 ? "aggressive" : d >= 0.5 ? "conservative" : "neutral",
      text: `진입 Cap ${(r.goingInCap * 100).toFixed(2)}% 대비 ${d >= 0 ? "+" : ""}${Math.round(d * 100)}bp`,
    };
  }
  if (corpAAPct !== null) {
    const d = allInRatePct - corpAAPct;
    out.allInRate = {
      stance: d < 0 ? "aggressive" : d > 1.5 ? "conservative" : "neutral",
      text: `회사채 AA- 3년 ${corpAAPct.toFixed(2)}% 대비 ${d >= 0 ? "+" : ""}${Math.round(d * 100)}bp`,
    };
  }
  out.units = { stance: "na", text: "실거래가에는 건물 전체 세대수가 없습니다 — 단지를 골라도 이 값은 바뀌지 않습니다. 건축물대장에서 확인해 직접 입력하십시오" };
  out.vacancyPct = { stance: "na", text: "실거래가 자료에는 공실 정보가 없습니다 — 현장 실사 값으로 대체하십시오" };
  out.opexPct = { stance: "na", text: "운영비는 공공데이터에 없습니다 — 임대관리 견적으로 대체하십시오" };
  return out;
}
