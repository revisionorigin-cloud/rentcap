import { describe, expect, it } from "vitest";
import { BASE_INPUT, EFF_LTV_CAP, positions, suggest } from "@/lib/assumptions";
import { computeMarket, type ComplexStat } from "@/lib/market";
import { loadRegion } from "@/lib/source";
import { underwrite } from "@/lib/underwrite";

describe("suggest — 시장값으로 가정 채우기", async () => {
  delete process.env.DATA_GO_KR_KEY;
  const m = computeMarket(await loadRegion("11560"));

  it("지역 채우기: 값과 출처가 함께 온다", () => {
    const s = suggest(BASE_INPUT, m, null);
    expect(s.input.pricePerPy).toBe(Math.round(m.kpi.pricePerPy!));
    expect(s.input.convRatePct).toBe(m.conv.ratePct);
    expect(s.from.pricePerPy).toContain("매매 중앙값");
    expect(underwrite(s.input).ok).toBe(true);
  });

  it("Exit Cap 추천 = 진입 Cap + 25bp", () => {
    const s = suggest(BASE_INPUT, m, null);
    const goingIn = underwrite(s.input).goingInCap * 100;
    expect(s.input.exitCapPct).toBeCloseTo(goingIn + 0.25, 1);
  });

  it("반전세 단지: 실질 LTV가 상한을 넘지 않게 대출을 낮추고 그 사실을 남긴다", () => {
    const heavy = m.complexes.filter((c) => c.medDeposit !== null && c.pricePerPy !== null)
      .sort((a, b) => b.medDeposit! / (b.pricePerPy! * b.medArea) - a.medDeposit! / (a.pricePerPy! * a.medArea))[0] as ComplexStat;
    const s = suggest(BASE_INPUT, m, heavy);
    const r = underwrite(s.input);
    const depShare = (r.deposits / r.price) * 100;
    if (depShare >= EFF_LTV_CAP) expect(s.input.ltvPct).toBe(0); // 보증금만으로 상한을 넘으면 대출을 쓰지 않는다
    else expect(r.effLtv * 100).toBeLessThanOrEqual(EFF_LTV_CAP);
    expect(r.ok).toBe(true);
    expect(s.from.ltvPct).toBeDefined();
  });

  it("시장 위치: 임대료를 시장 상단으로 올리면 '공격적'", () => {
    const s = suggest(BASE_INPUT, m, null).input;
    const p = positions({ ...s, effRentPerPy: m.tables.rent[19] }, m, 5, 4.7);
    expect(p.effRentPerPy?.stance).toBe("aggressive");
    expect(p.vacancyPct?.stance).toBe("na");
  });
});
