"use client";

import { useMemo } from "react";
import { Heat } from "./charts";
import { NumField, SectionHead } from "./fields";
import { eok, mult, num, pct, pctv } from "@/lib/format";
import { axis, grid, limits, type UWInput, type UWResult } from "@/lib/underwrite";

export function LimitsSection({ input, result, targetIrr, onTarget, legalCapPct }: {
  input: UWInput; result: UWResult; targetIrr: number; onTarget: (v: number) => void; legalCapPct: number | null;
}) {
  const L = useMemo(() => limits(input, targetIrr), [input, targetIrr]);

  const g1 = useMemo(() => {
    const rows = axis(input.exitCapPct, 0.25, 7, 0.5);
    const cols = axis(input.rentGrowthPct, 0.5, 5, -5);
    return { rows, cols, v: grid(input, "exitCapPct", rows, "rentGrowthPct", cols, "leveredIrr") };
  }, [input]);
  const g2 = useMemo(() => {
    const rows = axis(input.spreadBp, 50, 7, 0);
    const cols = axis(input.vacancyPct, 2.5, 5, 0);
    return { rows, cols, v: grid(input, "spreadBp", rows, "vacancyPct", cols, "minDscr") };
  }, [input]);
  const g3 = useMemo(() => {
    const step = Math.max(500, Math.round(input.depositPerUnit / 2 / 500) * 500);
    const rows = axis(input.depositPerUnit, step, 5, 0);
    const cols = axis(input.ltvPct, 5, 5, 0);
    return { rows, cols, v: grid(input, "depositPerUnit", rows, "ltvPct", cols, "leveredIrr") };
  }, [input]);

  const idx = (xs: number[], v: number) => xs.reduce((best, x, k) => (Math.abs(x - v) < Math.abs(xs[best] - v) ? k : best), 0);
  const fmtIrr = (v: number | null) => (v === null ? "–" : pctv(v * 100, 1));
  const priceGap = L.maxPricePerPy === null ? null : (L.maxPricePerPy / input.pricePerPy - 1) * 100;

  return (
    <section id="limits" className="sec">
      <SectionHead no="03" title="한계선과 민감도" lead="결론은 '된다 / 안 된다'가 아니라 어디까지 나빠져도 버티는가입니다. 손익분기는 두 개를 따로 봅니다 — 투자자의 원금과 대주의 원리금." />

      <div className="limits">
        <div className="limit">
          <div className="limit-no">①</div>
          <h3>자기자본 원금 보전선</h3>
          <div className="limit-value">{L.capitalPreserve ? `Exit Cap ${pctv(L.capitalPreserve.exitCapPct, 2)}` : "–"}</div>
          <p>{L.capitalPreserve ? <>매각가가 매입가 대비 <b>{pctv(L.capitalPreserve.saleVsPrice * 100, 1, true)}</b>일 때 Equity Multiple이 정확히 1.0x가 됩니다. 현재 가정 {pctv(input.exitCapPct, 2)}에서 <b>{Math.round((L.capitalPreserve.exitCapPct - input.exitCapPct) * 100)}bp</b>의 여유입니다.</> : "탐색 구간(Exit Cap 0.5~40%) 안에서 원금 보전 지점을 찾지 못했습니다."}</p>
        </div>
        <div className="limit">
          <div className="limit-no">②</div>
          <h3>대주 상환 한계선</h3>
          <div className="limit-value">{L.debtCover ? `Exit Cap ${pctv(L.debtCover.exitCapPct, 2)}` : "–"}</div>
          <p>{L.debtCover ? <>매각가가 매입가 대비 <b>{pctv(L.debtCover.saleVsPrice * 100, 1, true)}</b>까지 내려가도 매각대금으로 대출 {eok(result.loan)}과 보증금 {eok(result.deposits)}을 전액 상환합니다. 그 아래에서는 자기자본이 전액 손실되고 대주 원금이 침해됩니다.</> : "대출이 없거나 한계 지점을 찾지 못했습니다."}</p>
        </div>
        <div className="limit">
          <div className="limit-no">역산</div>
          <h3>목표 수익률 기준</h3>
          <NumField label="목표 Levered IRR" unit="%" value={targetIrr} step={0.5} min={0} max={40} onChange={onTarget} />
          <dl className="facts col">
            <div><dt>최대 매입 단가</dt><dd>{L.maxPricePerPy === null ? "–" : `${num(L.maxPricePerPy, 0)}만원/평`} {priceGap !== null && <span>현재 대비 {pctv(priceGap, 1, true)}</span>}</dd></div>
            <div><dt>DSCR 1.2x가 되는 대출금리</dt><dd>{L.rateAtDscr === null ? "–" : pctv(L.rateAtDscr, 2)} <span>현재 {pct(result.rate)}</span></dd></div>
            <div><dt>1년차 손익분기 입주율</dt><dd>{result.breakevenOcc === null ? "–" : pct(result.breakevenOcc, 1)} <span>가정 {pctv(100 - input.vacancyPct, 1)}</span></dd></div>
          </dl>
        </div>
      </div>

      <div className="grid2 heats">
        <figure>
          <figcaption>Exit Cap × 임대료 성장률 → Levered IRR <span>색 경계 = 목표 {pctv(targetIrr, 1)} · 굵은 테두리 = 현재 가정 · 붉은 테두리 = 원금 손실</span></figcaption>
          <Heat rowLabel="Exit Cap" colLabel="성장률" rows={g1.rows.map((v) => pctv(v, 2))} cols={g1.cols.map((v) => pctv(v, 1))} values={g1.v}
            fmt={fmtIrr} threshold={targetIrr / 100} scale={0.08} centerRow={idx(g1.rows, input.exitCapPct)} centerCol={idx(g1.cols, input.rentGrowthPct)} floor={0} />
        </figure>
        <figure>
          <figcaption>가산금리 × 공실률 → 최소 DSCR <span>색 경계 = 1.2x · 붉은 테두리 = 1.0x 미만 (이자 미지급)</span></figcaption>
          <Heat rowLabel="가산금리" colLabel="공실률" rows={g2.rows.map((v) => `${num(v)}bp`)} cols={g2.cols.map((v) => pctv(v, 1))} values={g2.v}
            fmt={(v) => mult(v)} threshold={1.2} scale={0.6} centerRow={idx(g2.rows, input.spreadBp)} centerCol={idx(g2.cols, input.vacancyPct)} floor={1} />
        </figure>
      </div>

      <figure>
        <figcaption>세대당 보증금 × LTV → Levered IRR <span>한국 임대주택 고유의 구조화 변수 — 보증금은 무이자 조달이지만 월세를 전환율만큼 깎습니다</span></figcaption>
        <Heat rowLabel="보증금" colLabel="LTV" rows={g3.rows.map((v) => `${num(v)}만원`)} cols={g3.cols.map((v) => pctv(v, 0))} values={g3.v}
          fmt={fmtIrr} threshold={targetIrr / 100} scale={0.08} centerRow={idx(g3.rows, input.depositPerUnit)} centerCol={idx(g3.cols, input.ltvPct)} floor={0} />
        <p className="fine">
          읽는 법: 보증금은 이자가 없지만 그만큼 월세를 포기하므로 실질 조달비용은 전환율 {pctv(input.convRatePct, 2)}입니다.
          대출금리 {pct(result.rate)}보다 {input.convRatePct > result.rate * 100 ? "비싼 조달이라 보증금을 줄이고 월세를 늘리는 쪽(위쪽 행)이 유리합니다" : "싼 조달이라 보증금을 늘리는 쪽(아래쪽 행)이 유리합니다"}.
          {legalCapPct !== null && <> 다만 기존 임차인의 보증금을 월세로 돌릴 때는 법정 전환율 상한 {pctv(legalCapPct, 2)}(한국은행 기준금리 + 2%p, 주택임대차보호법 제7조의2·시행령 제9조)가 적용되어, 시장 전환율로의 전환은 신규 계약에서만 가능합니다.</>}
        </p>
      </figure>
    </section>
  );
}
