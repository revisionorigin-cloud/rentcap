import { describe, expect, it } from "vitest";
import { limits, underwrite, type UWInput } from "@/lib/underwrite";
import { verdict } from "@/lib/verdict";

const base: UWInput = {
  units: 100, areaPy: 8, pricePerPy: 3000, acqTaxPct: 4.6, acqCostPct: 1.0,
  effRentPerPy: 14, depositPerUnit: 1000, convRatePct: 5.5,
  vacancyPct: 5, opexPct: 15, capexPct: 2, holdTaxPct: 0.25, rentGrowthPct: 2,
  ltvPct: 50, baseRatePct: 3.2, spreadBp: 180, holdYears: 5, exitCapPct: 4.5, saleCostPct: 1.5,
  taxMode: "conduit", corpTaxPct: 22, buildingRatioPct: 40, deprYears: 40,
};
const run = (i: UWInput, target: number) => verdict(i, underwrite(i), limits(i, target), target, {});

describe("verdict — 결론 문장", () => {
  it("목표 미달이면 낮춰야 할 매입 단가를 말한다 — 그 숫자는 limits()의 역산값과 같다", () => {
    const v = run(base, 12);
    const L = limits(base, 12);
    expect(v.tone).not.toBe("ok");
    expect(v.headline).toContain("낮춰야");
    expect(v.headline).toContain(Math.round(L.maxPricePerPy!).toLocaleString("ko-KR"));
  });
  it("싸게 사면 목표 충족으로 바뀐다", () => {
    const v = run({ ...base, pricePerPy: 2000 }, 8);
    expect(v.tone).toBe("ok");
    expect(v.headline).toContain("충족");
  });
  it("대주 관점 문장은 상환 한계선과 DSCR을 담는다", () => {
    const v = run(base, 8);
    expect(v.lender).toContain("전액 상환");
    expect(v.lender).toContain("DSCR");
  });
  it("대출이 없으면 대주 문장이 달라진다", () => {
    expect(run({ ...base, ltvPct: 0 }, 8).lender).toContain("대출 없이");
  });
  it("계산 불가 구조는 bad", () => {
    expect(run({ ...base, ltvPct: 110 }, 8).tone).toBe("bad");
  });
  it("가정 점검 요약을 센다", () => {
    const v = verdict(base, underwrite(base), limits(base, 8), 8, {
      a: { stance: "aggressive", text: "" }, b: { stance: "neutral", text: "" }, c: { stance: "na", text: "" },
    });
    expect(v.tally).toEqual({ aggressive: 1, neutral: 1, conservative: 0, na: 1 });
  });
});
