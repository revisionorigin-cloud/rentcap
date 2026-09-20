import { irr, npv, solveScan } from "./finance";

/**
 * 임대주택(오피스텔) 통매입 언더라이팅 — 연 단위 모델.
 * 금액 단위: 만원. 비율 입력은 전부 % (예: 4.6 = 4.6%), spreadBp만 bp.
 *
 * 모델의 핵심 규약 (검증 탭에도 같은 문장으로 공개한다)
 * 1) 보증금은 매입 시 승계한다: 조달(Sources) = 대출 + 승계 보증금 + 자기자본.
 *    매각 시에도 매수인이 승계하므로 매각대금에서 보증금을 차감한다. 보유기간 중 보증금은 일정하다고 본다.
 * 2) Cap rate는 국내 관행인 "보증금 차감 기준": Cap = 현금 NOI ÷ (가격 − 보증금).
 *    따라서 매각가 = (매각 다음 해 NOI ÷ Exit Cap) + 보증금.
 * 3) 월세 현금수입 = 환산월세 − 보증금 × 전월세전환율 ÷ 12. 보증금을 늘리면 월세가 그만큼 준다.
 * 4) 대출은 만기일시상환(이자만 납부). DSCR = NOI ÷ 이자.
 */
export type UWInput = {
  units: number; // 세대수
  areaPy: number; // 세대당 평균 전용평
  pricePerPy: number; // 매입 단가 (만원/전용평)
  acqTaxPct: number; // 취득세 등 (매입가 대비)
  acqCostPct: number; // 기타 취득부대비 (매입가 대비)
  effRentPerPy: number; // 환산월세 (만원/전용평·월) — 보증금을 전환율로 월세화한 완전월세
  depositPerUnit: number; // 세대당 보증금 (만원)
  convRatePct: number; // 전월세전환율
  vacancyPct: number; // 안정화 공실률
  opexPct: number; // 운영비 (EGI 대비)
  capexPct: number; // 수선·교체 적립 (EGI 대비)
  holdTaxPct: number; // 보유세 (매입가 대비, 연)
  rentGrowthPct: number; // 임대료 성장률 (연)
  ltvPct: number; // 선순위 대출 (매입가 대비)
  baseRatePct: number; // 기준이 되는 시장금리
  spreadBp: number; // 가산금리
  holdYears: number; // 보유기간 (년)
  exitCapPct: number; // Exit Cap (보증금 차감 기준)
  saleCostPct: number; // 매각 비용 (매각가 대비)
  taxMode: "conduit" | "corp"; // 도관(리츠·펀드) / 일반법인
  corpTaxPct: number; // 법인세 + 지방소득세 실효세율
  buildingRatioPct: number; // 취득원가 중 건물분
  deprYears: number; // 건물 내용연수
};

export type UWYear = {
  year: number;
  pgi: number; // 가능총수입 (월세 현금 기준)
  vacancy: number;
  egi: number;
  opex: number;
  capex: number;
  holdTax: number;
  noi: number;
  interest: number;
  tax: number;
  cf: number; // 자기자본 현금흐름 (매각 제외)
  dscr: number | null;
};

export type UWResult = {
  ok: boolean;
  warnings: string[];
  gla: number; // 총 전용평
  price: number;
  acqCost: number;
  uses: number;
  loan: number;
  deposits: number; // 승계 보증금 (공실 반영)
  equity: number;
  rate: number; // 대출금리 (소수)
  cashRentPerUnit: number; // 세대당 월세 현금 (만원/월)
  years: UWYear[];
  fwdNoi: number; // 매각 다음 해 NOI
  saleValue: number;
  saleCost: number;
  exitTax: number;
  saleNetToEquity: number;
  leveredCfs: number[];
  unleveredCfs: number[];
  leveredIrr: number | null;
  unleveredIrr: number | null;
  equityMultiple: number | null;
  avgCoC: number | null;
  minDscr: number | null;
  goingInCap: number; // NOI1 ÷ (매입가 − 보증금)
  yieldOnCost: number; // NOI1 ÷ (총 취득원가 − 보증금)
  debtYield: number | null; // NOI1 ÷ 대출
  effLtv: number; // (대출 + 보증금) ÷ 매입가
  breakevenOcc: number | null; // 1년차 이자까지 내고 0이 되는 입주율
  checks: { label: string; pass: boolean | null; detail: string }[]; // null = 해당 없음
};

const pct = (x: number) => x / 100;

export function underwrite(i: UWInput): UWResult {
  const warnings: string[] = [];
  const gla = i.units * i.areaPy;
  const price = gla * i.pricePerPy;
  const acqCost = price * (pct(i.acqTaxPct) + pct(i.acqCostPct));
  const uses = price + acqCost;
  const occ = 1 - pct(i.vacancyPct);
  const deposits = i.units * i.depositPerUnit * occ;
  const loan = price * pct(i.ltvPct);
  const equity = uses - loan - deposits;
  const rate = pct(i.baseRatePct) + i.spreadBp / 10000;

  const fullRentPerUnit = i.effRentPerPy * i.areaPy;
  const rawCashRent = fullRentPerUnit - (i.depositPerUnit * pct(i.convRatePct)) / 12;
  const cashRentPerUnit = Math.max(0, rawCashRent);
  if (rawCashRent < 0) warnings.push("보증금이 환산월세 전체를 넘어섭니다 — 사실상 전세 구조이며 월세 현금수입을 0으로 계산했습니다.");
  if (equity <= 0) warnings.push("대출과 승계 보증금의 합이 총 취득원가를 넘습니다 — 자기자본이 0 이하라 수익률을 계산할 수 없습니다.");

  const n = Math.max(1, Math.round(i.holdYears));
  const g = pct(i.rentGrowthPct);
  const holdTax = price * pct(i.holdTaxPct);
  const interest = loan * rate;
  const deprBase = uses * pct(i.buildingRatioPct);
  const depr = i.deprYears > 0 ? deprBase / i.deprYears : 0;
  const corp = i.taxMode === "corp";

  const noiOf = (y: number) => {
    const pgi = cashRentPerUnit * 12 * i.units * Math.pow(1 + g, y - 1);
    const vacancy = pgi * pct(i.vacancyPct);
    const egi = pgi - vacancy;
    const opex = egi * pct(i.opexPct);
    const capex = egi * pct(i.capexPct);
    return { pgi, vacancy, egi, opex, capex, noi: egi - opex - capex - holdTax };
  };

  const years: UWYear[] = [];
  for (let y = 1; y <= n; y++) {
    const r = noiOf(y);
    const taxable = r.noi - interest - depr;
    const tax = corp ? Math.max(0, taxable) * pct(i.corpTaxPct) : 0;
    years.push({
      year: y, ...r, holdTax, interest, tax,
      cf: r.noi - interest - tax,
      dscr: interest > 0 ? r.noi / interest : null,
    });
  }

  const fwdNoi = noiOf(n + 1).noi;
  const exitCap = pct(i.exitCapPct);
  const saleValue = exitCap > 0 ? fwdNoi / exitCap + deposits : 0;
  const saleCost = saleValue * pct(i.saleCostPct);
  const bookValue = uses - depr * n;
  const gain = saleValue - saleCost - bookValue;
  const exitTax = corp ? Math.max(0, gain) * pct(i.corpTaxPct) : 0;
  const saleNetToEquity = saleValue - saleCost - deposits - loan - exitTax;

  const ok = equity > 0 && price > 0;
  const leveredCfs = [-equity, ...years.map((y, k) => y.cf + (k === n - 1 ? saleNetToEquity : 0))];
  // 무차입: 대출만 제거. 보증금은 자산에 붙은 임차인 부채라 그대로 둔다.
  const unlevEquity = uses - deposits;
  const unleveredCfs = [
    -unlevEquity,
    ...years.map((y, k) => {
      const taxU = corp ? Math.max(0, y.noi - depr) * pct(i.corpTaxPct) : 0;
      const exitU = k === n - 1 ? saleValue - saleCost - deposits - exitTax : 0;
      return y.noi - taxU + exitU;
    }),
  ];

  const leveredIrr = ok ? irr(leveredCfs) : null;
  const unleveredIrr = unlevEquity > 0 ? irr(unleveredCfs) : null;
  const inflow = leveredCfs.slice(1).reduce((a, b) => a + b, 0);
  const equityMultiple = ok ? inflow / equity : null;
  const avgCoC = ok ? years.reduce((a, y) => a + y.cf, 0) / n / equity : null;
  const dscrs = years.map((y) => y.dscr).filter((d): d is number => d !== null);
  const minDscr = dscrs.length ? Math.min(...dscrs) : null;
  const noi1 = years[0].noi;

  // 1년차 손익분기 입주율: EGI×(1−opex−capex) − 보유세 − 이자 = 0
  const margin = 1 - pct(i.opexPct) - pct(i.capexPct);
  const pgi1 = years[0].pgi;
  const breakevenOcc = pgi1 > 0 && margin > 0 ? (holdTax + interest) / margin / pgi1 : null;

  const sources = loan + deposits + equity;
  const checks = [
    {
      label: "조달 = 사용 (Sources = Uses)",
      pass: Math.abs(sources - uses) < 1e-6 * Math.max(1, uses),
      detail: `대출 + 승계 보증금 + 자기자본 − (매입가 + 취득부대비) = ${(sources - uses).toFixed(4)}`,
    },
    {
      label: "IRR 역산 (NPV@IRR = 0)",
      pass: leveredIrr === null ? null : Math.abs(npv(leveredIrr, leveredCfs)) < 1e-4 * Math.max(1, equity),
      detail: leveredIrr === null ? "IRR을 산출할 수 없는 입력입니다 (자기자본 ≤ 0 또는 현금흐름 부호 변화 없음)" : `NPV(IRR) = ${npv(leveredIrr, leveredCfs).toFixed(6)} 만원`,
    },
    {
      label: "매각가 = 차년도 NOI ÷ Exit Cap + 보증금",
      pass: exitCap > 0 && Math.abs((saleValue - deposits) * exitCap - fwdNoi) < 1e-6 * Math.max(1, Math.abs(fwdNoi)),
      detail: `(매각가 − 보증금) × Exit Cap − 차년도 NOI = ${((saleValue - deposits) * exitCap - fwdNoi).toFixed(4)}`,
    },
    {
      label: "연도별 NOI 항등식",
      pass: years.every((y) => Math.abs(y.pgi - y.vacancy - y.opex - y.capex - y.holdTax - y.noi) < 1e-6 * Math.max(1, y.pgi)),
      detail: "PGI − 공실 − 운영비 − 수선적립 − 보유세 = NOI (전 연도)",
    },
  ];

  return {
    ok, warnings, gla, price, acqCost, uses, loan, deposits, equity, rate, cashRentPerUnit,
    years, fwdNoi, saleValue, saleCost, exitTax, saleNetToEquity, leveredCfs, unleveredCfs,
    leveredIrr, unleveredIrr, equityMultiple, avgCoC, minDscr,
    goingInCap: price - deposits > 0 ? noi1 / (price - deposits) : NaN,
    yieldOnCost: uses - deposits > 0 ? noi1 / (uses - deposits) : NaN,
    debtYield: loan > 0 ? noi1 / loan : null,
    effLtv: price > 0 ? (loan + deposits) / price : NaN,
    breakevenOcc,
    checks,
  };
}

export type Limits = {
  /** 자기자본 원금 보전(EM = 1.0x)이 되는 Exit Cap과 그때의 매각가/매입가 */
  capitalPreserve: { exitCapPct: number; saleVsPrice: number } | null;
  /** 매각대금으로 대출과 보증금을 정확히 갚는 Exit Cap — 대주 상환 한계선 */
  debtCover: { exitCapPct: number; saleVsPrice: number } | null;
  /** 목표 IRR을 맞추는 최대 매입 단가 (만원/전용평) */
  maxPricePerPy: number | null;
  /** DSCR이 기준 배수가 되는 대출금리 (%) */
  rateAtDscr: number | null;
};

export function limits(i: UWInput, targetIrrPct: number, dscrFloor = 1.2): Limits {
  const base = underwrite(i);
  const at = (cap: number) => underwrite({ ...i, exitCapPct: cap });
  const pack = (cap: number | null) => {
    if (cap === null) return null;
    const r = at(cap);
    return { exitCapPct: cap, saleVsPrice: r.saleValue / r.price - 1 };
  };
  const capEm = solveScan((c) => at(c).equityMultiple ?? NaN, 1, 0.5, 40, 160);
  const capDebt = solveScan((c) => at(c).saleNetToEquity, 0, 0.5, 80, 320);
  const maxPrice = solveScan(
    (p) => underwrite({ ...i, pricePerPy: p }).leveredIrr ?? NaN,
    targetIrrPct / 100,
    i.pricePerPy * 0.3,
    i.pricePerPy * 2.5,
  );
  const noi1 = base.years[0]?.noi ?? 0;
  const rateAtDscr = base.loan > 0 && noi1 > 0 ? (noi1 / dscrFloor / base.loan) * 100 : null;
  return { capitalPreserve: pack(capEm), debtCover: pack(capDebt), maxPricePerPy: maxPrice, rateAtDscr };
}

export type GridMetric = "leveredIrr" | "minDscr" | "avgCoC" | "equityMultiple";

export function grid(
  i: UWInput,
  rowKey: keyof UWInput,
  rowVals: number[],
  colKey: keyof UWInput,
  colVals: number[],
  metric: GridMetric,
): (number | null)[][] {
  return rowVals.map((rv) =>
    colVals.map((cv) => {
      const r = underwrite({ ...i, [rowKey]: rv, [colKey]: cv } as UWInput);
      return r.ok ? r[metric] : null;
    }),
  );
}

/** 기준값을 가운데 두고 step 간격으로 count개 (홀수 권장). 하한 min 아래로는 내려가지 않는다 */
export function axis(center: number, step: number, count: number, min = 0): number[] {
  const half = Math.floor(count / 2);
  let start = center - half * step;
  if (start < min) start = min;
  return Array.from({ length: count }, (_, k) => Math.round((start + k * step) * 1000) / 1000);
}
