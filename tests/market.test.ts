import { describe, expect, it } from "vitest";
import { buildRegion, lastMonths, parseHeader, parseItems } from "@/lib/datago";
import { computeMarket, effRentPerPy, estimateConversion } from "@/lib/market";
import { percentileFromTable, quantileTable } from "@/lib/stats";
import type { RentDeal } from "@/lib/types";

const deal = (p: Partial<RentDeal>): RentDeal => ({
  cx: 0, area: 33.058, ymd: 20260601, deposit: 1000, rent: 80, floor: 5, ctype: 1, rrr: 0, prevDeposit: 0, prevRent: 0, ...p,
});

describe("환산월세 · 전환율", () => {
  it("환산월세 = (월세 + 보증금×전환율/12) ÷ 전용평", () => {
    // 10평, 보증금 1,200만원, 월세 80만원, 전환율 6% → (80 + 6) / 10 = 8.6
    expect(effRentPerPy(1200, 80, 33.058, 6)).toBeCloseTo(8.6, 6);
  });
  it("전세·월세 쌍에서 전환율을 복원한다", () => {
    // 전세 2억, 월세는 보증금 2천 + 월 90 → r = 90×12 / 1.8억 = 6.0%
    const rent: RentDeal[] = [];
    for (let k = 0; k < 40; k++) {
      rent.push(deal({ rent: 0, deposit: 20000 }));
      rent.push(deal({ rent: 90, deposit: 2000 }));
    }
    const c = estimateConversion(rent, 20250101);
    expect(c.method).toBe("implied");
    expect(c.ratePct).toBeCloseTo(6, 6);
  });
  it("표본이 모자라면 기본값이라고 밝힌다", () => {
    expect(estimateConversion([deal({})], 20250101).method).toBe("default");
  });
});

describe("분위수 표", () => {
  it("백분위 보간", () => {
    const t = quantileTable(Array.from({ length: 101 }, (_, i) => i));
    expect(percentileFromTable(t, 50)).toBeCloseTo(50, 6);
    expect(percentileFromTable(t, -5)).toBe(0);
    expect(percentileFromTable(t, 500)).toBe(100);
  });
});

describe("data.go.kr 응답 해석", () => {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?><response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items>' +
    "<item><buildYear>2019</buildYear><contractTerm>26.10~28.10</contractTerm><contractType>갱신</contractType><dealDay>18</dealDay><dealMonth>9</dealMonth><dealYear>2026</dealYear>" +
    "<deposit>9,000</deposit><excluUseAr>27.98</excluUseAr><floor>17</floor><jibun>94-154</jibun><monthlyRent>64</monthlyRent><offiNm>여의도 디앤써밋</offiNm>" +
    "<preDeposit>9,000</preDeposit><preMonthlyRent>61</preMonthlyRent><sggCd>11560</sggCd><sggNm>영등포구</sggNm><umdNm>영등포동2가</umdNm><useRRRight>사용</useRRRight></item>" +
    "</items><numOfRows>1000</numOfRows><pageNo>1</pageNo><totalCount>1</totalCount></body></response>";

  it("헤더와 item을 읽는다", () => {
    expect(parseHeader(xml)).toEqual({ code: "000", msg: "OK", total: 1 });
    const items = parseItems(xml);
    expect(items).toHaveLength(1);
    expect(items[0].offiNm).toBe("여의도 디앤써밋");
  });
  it("미등록 키 오류 봉투를 인식한다", () => {
    const err =
      "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</errMsg>" +
      "<returnAuthMsg>등록되지 않은 서비스키</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
    expect(parseHeader(err).code).toBe("30");
  });
  it("거래 레코드로 정규화 — 콤마 금액 · 갱신 · 갱신요구권", () => {
    const built = buildRegion(parseItems(xml), []);
    expect(built.complexes[0].key).toBe("영등포동2가|94-154|여의도 디앤써밋");
    expect(built.rent[0]).toMatchObject({ deposit: 9000, rent: 64, ymd: 20260918, ctype: 2, rrr: 1, prevRent: 61 });
  });
  it("최근 n개월 (서울 시간, 연도 넘김)", () => {
    expect(lastMonths(3, new Date("2026-01-15T00:00:00Z"))).toEqual(["202601", "202512", "202511"]);
  });
});

describe("computeMarket — 해제 거래 제외", () => {
  it("해제된 매매는 단가 통계에서 빠진다", () => {
    const m = computeMarket({
      meta: { code: "0", name: "t", asset: "오피스텔", mode: "snapshot", source: "t", from: "", to: "", fetchedAt: "" },
      complexes: [{ key: "k", name: "n", dong: "d", jibun: "1", road: "", buildYear: 2020 }],
      rent: Array.from({ length: 6 }, () => deal({})),
      trade: [
        ...Array.from({ length: 3 }, () => ({ cx: 0, area: 33.058, ymd: 20260601, price: 30000, floor: 1, canceled: 0 as const })),
        { cx: 0, area: 33.058, ymd: 20260601, price: 90000, floor: 1, canceled: 1 as const },
      ],
    });
    expect(m.kpi.pricePerPy).toBeCloseTo(3000, 6);
    expect(m.counts.tradeCanceled).toBe(1);
  });
});
