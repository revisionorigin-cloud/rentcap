import { describe, expect, it } from "vitest";
import { irr, npv, solve } from "@/lib/finance";

describe("irr", () => {
  it("교재 검증값: 센텀 리버뷰 사업 현금흐름 → 13.58%", () => {
    const r = irr([-1094.5, 432.7, 469.8, 512.0]);
    expect(r).not.toBeNull();
    expect(r! * 100).toBeCloseTo(13.58, 2);
  });
  it("NPV(IRR) = 0", () => {
    const cfs = [-1000, 80, 80, 80, 80, 1080];
    const r = irr(cfs)!;
    expect(r).toBeCloseTo(0.08, 8);
    expect(npv(r, cfs)).toBeCloseTo(0, 6);
  });
  it("부호 변화가 없으면 null", () => {
    expect(irr([100, 100])).toBeNull();
    expect(irr([-100, -100])).toBeNull();
  });
  it("원금 손실이면 음수 IRR", () => {
    expect(irr([-100, 0, 50])!).toBeLessThan(0);
  });
});

describe("solve", () => {
  it("단조 함수의 역산", () => {
    expect(solve((x) => x * x, 9, 0, 10)!).toBeCloseTo(3, 8);
  });
  it("구간 밖이면 null", () => {
    expect(solve((x) => x, 100, 0, 10)).toBeNull();
  });
});
