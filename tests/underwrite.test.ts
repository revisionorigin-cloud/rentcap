import { describe, expect, it } from "vitest";
import { limits, underwrite, type UWInput } from "@/lib/underwrite";

const base: UWInput = {
  units: 100, areaPy: 8, pricePerPy: 3000, acqTaxPct: 4.6, acqCostPct: 1.0,
  effRentPerPy: 14, depositPerUnit: 1000, convRatePct: 5.5,
  vacancyPct: 5, opexPct: 15, capexPct: 2, holdTaxPct: 0.25, rentGrowthPct: 2,
  ltvPct: 50, baseRatePct: 3.2, spreadBp: 180, holdYears: 5, exitCapPct: 4.5, saleCostPct: 1.5,
  taxMode: "conduit", corpTaxPct: 22, buildingRatioPct: 40, deprYears: 40,
};

describe("underwrite", () => {
  const r = underwrite(base);
  it("손계산 대조 — 매입가·조달", () => {
    expect(r.gla).toBe(800);
    expect(r.price).toBe(2_400_000); // 800평 × 3,000만원 = 240억
    expect(r.acqCost).toBeCloseTo(2_400_000 * 0.056, 6);
    expect(r.deposits).toBeCloseTo(100 * 1000 * 0.95, 6);
    expect(r.loan).toBe(1_200_000);
    expect(r.loan + r.deposits + r.equity).toBeCloseTo(r.uses, 6);
  });
  it("손계산 대조 — 1년차 NOI", () => {
    const cash = 14 * 8 - (1000 * 0.055) / 12; // 세대당 월세 현금
    const pgi = cash * 12 * 100;
    const egi = pgi * 0.95;
    const noi = egi * (1 - 0.15 - 0.02) - 2_400_000 * 0.0025;
    expect(r.cashRentPerUnit).toBeCloseTo(cash, 8);
    expect(r.years[0].noi).toBeCloseTo(noi, 6);
    expect(r.goingInCap).toBeCloseTo(noi / (r.price - r.deposits), 10);
  });
  it("검증 항목이 전부 통과", () => {
    expect(r.checks.every((c) => c.pass === true)).toBe(true);
  });
  it("매각가 = 차년도 NOI ÷ Exit Cap + 보증금", () => {
    expect((r.saleValue - r.deposits) * 0.045).toBeCloseTo(r.fwdNoi, 4);
  });
  it("도관 → 일반법인이면 세후 수익률이 낮아진다", () => {
    const c = underwrite({ ...base, taxMode: "corp" });
    expect(c.leveredIrr!).toBeLessThan(r.leveredIrr!);
  });
  it("Exit Cap이 오르면 IRR이 내려간다 (단조)", () => {
    const hi = underwrite({ ...base, exitCapPct: 5.5 });
    expect(hi.leveredIrr!).toBeLessThan(r.leveredIrr!);
  });
  it("자기자본이 0 이하이면 ok=false", () => {
    expect(underwrite({ ...base, ltvPct: 110 }).ok).toBe(false);
  });
});

describe("limits", () => {
  const L = limits(base, 8);
  it("원금 보전선에서 EM = 1.0", () => {
    expect(L.capitalPreserve).not.toBeNull();
    const r = underwrite({ ...base, exitCapPct: L.capitalPreserve!.exitCapPct });
    expect(r.equityMultiple!).toBeCloseTo(1, 6);
  });
  it("대주 상환 한계선에서 매각 잔여 = 0", () => {
    expect(L.debtCover).not.toBeNull();
    const r = underwrite({ ...base, exitCapPct: L.debtCover!.exitCapPct });
    expect(Math.abs(r.saleNetToEquity)).toBeLessThan(1);
  });
  it("상환 한계선은 원금 보전선보다 더 나쁜(높은) Exit Cap", () => {
    expect(L.debtCover!.exitCapPct).toBeGreaterThan(L.capitalPreserve!.exitCapPct);
  });
  it("최대 매입가에서 목표 IRR 달성", () => {
    expect(L.maxPricePerPy).not.toBeNull();
    const r = underwrite({ ...base, pricePerPy: L.maxPricePerPy! });
    expect(r.leveredIrr! * 100).toBeCloseTo(8, 4);
  });
  it("DSCR 기준 금리 역산", () => {
    const spread = (L.rateAtDscr! - base.baseRatePct) * 100;
    const r = underwrite({ ...base, spreadBp: spread });
    expect(r.years[0].dscr!).toBeCloseTo(1.2, 6);
  });
});
