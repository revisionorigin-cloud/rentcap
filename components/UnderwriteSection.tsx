"use client";

import { CfBars, StackBar } from "./charts";
import { Kpi, NumField, SectionHead, Seg } from "./fields";
import type { Position, Provenance } from "@/lib/assumptions";
import type { Rates } from "@/lib/ecos";
import { eok, mult, num, pct, pctv } from "@/lib/format";
import { PY } from "@/lib/types";
import type { UWInput, UWResult } from "@/lib/underwrite";
import type { Verdict } from "@/lib/verdict";

export type Bench = "cd91" | "ktb3" | "base" | "corpAA" | "manual";
const ACQ_PRESETS = [
  { id: "4.6", label: "오피스텔 4.6%" },
  { id: "12.4", label: "법인 주택 중과 12.4%" },
  { id: "custom", label: "직접 입력" },
];

export function UnderwriteSection({ input, set, result, pos, from, rates, bench, onBench, onShare, onCsv, shareMsg, verdict, basis, edited, onReset }: {
  input: UWInput; set: <K extends keyof UWInput>(k: K, v: UWInput[K]) => void; result: UWResult;
  pos: Partial<Record<keyof UWInput | "allInRate", Position>>; from: Provenance; rates: Rates | null;
  bench: Bench; onBench: (b: Bench) => void; onShare: () => void; onCsv: () => void; shareMsg: string | null;
  verdict: Verdict; basis: string | null; edited: boolean; onReset: () => void;
}) {
  const r = result;
  const allIn = r.rate * 100;
  const acqPreset = input.acqTaxPct === 4.6 ? "4.6" : input.acqTaxPct === 12.4 ? "12.4" : "custom";
  const negLev = Number.isFinite(r.goingInCap) && r.goingInCap < r.rate && r.loan > 0;
  const aggressive = (Object.entries(pos) as [string, Position][]).filter(([, p]) => p.stance === "aggressive");

  const notes: { tone: "warn" | "ok" | "info"; text: string }[] = [];
  for (const w of r.warnings) notes.push({ tone: "warn", text: w });
  if (r.ok) {
    if (negLev) notes.push({ tone: "warn", text: `역레버리지 — 진입 Cap ${pct(r.goingInCap)}가 대출금리 ${pctv(allIn, 2)}보다 낮습니다. 대출을 늘릴수록 보유기간 현금수익률이 떨어지고, 수익은 매각차익에 의존합니다.` });
    else if (r.loan > 0) notes.push({ tone: "ok", text: `정(+)의 레버리지 — 진입 Cap ${pct(r.goingInCap)}가 대출금리 ${pctv(allIn, 2)}보다 높습니다.` });
    if (r.minDscr !== null) notes.push({ tone: r.minDscr < 1.2 ? "warn" : "ok", text: `최소 DSCR ${mult(r.minDscr)} — 통상 요구 수준 1.2x ${r.minDscr < 1.2 ? "미달" : "충족"}. 1년차 손익분기 입주율 ${r.breakevenOcc === null ? "–" : pct(r.breakevenOcc, 1)}.` });
    if (r.effLtv > 0.7) notes.push({ tone: "warn", text: r.loan > 0
      ? `보증금을 포함한 실질 LTV가 ${pct(r.effLtv, 1)}입니다. 대주는 선순위 임차보증금을 대출 한도에서 차감하는 것이 일반적이므로 LTV ${pctv(input.ltvPct, 0)} 조달이 어려울 수 있습니다.`
      : `승계 보증금만으로 매입가의 ${pct(r.effLtv, 1)}입니다 (반전세 구조). 추가 대출 여력이 없고, 임차인이 나갈 때 보증금을 돌려줄 유동성 — 역전세 위험 — 을 따로 확보해야 합니다.` });
    if (aggressive.length > 0) notes.push({ tone: "warn", text: `시장 대비 공격적인 가정 ${aggressive.length}개 — 입력란의 붉은 표시를 확인하십시오. 이 수익률은 그 가정이 실현될 때만 성립합니다.` });
  }

  return (
    <section id="underwrite" className="sec">
      <SectionHead no="02" title="언더라이팅" lead="입력값은 서버로 가지 않고 이 브라우저 안에서 계산합니다. 시장에서 온 값에는 출처가, 비교 가능한 가정에는 시장 대비 위치가 붙습니다."
        aside={<div className="btn-row"><button type="button" className="btn" onClick={onShare}>{shareMsg ?? "이 검토 링크 복사"}</button><button type="button" className="btn" onClick={onCsv}>현금흐름 CSV</button><button type="button" className="btn" onClick={() => window.print()}>인쇄 · PDF</button></div>} />

      <div className="uw">
        <div className="uw-inputs">
          <div className="basis">
            <div>
              <span className="basis-label">가정 기준</span>
              <b>{basis ?? "직접 입력"}</b>
              {edited && <span className="basis-edited">수정됨</span>}
            </div>
            <button type="button" className="link" onClick={onReset} disabled={!edited}>시장값으로 되돌리기</button>
          </div>
          <fieldset>
            <legend>자산</legend>
            <NumField label="세대수" unit="세대" value={input.units} step={1} min={1} onChange={(v) => set("units", Math.round(v))} />
            <NumField label="세대당 전용면적" unit="평" value={input.areaPy} step={0.1} min={1} onChange={(v) => set("areaPy", v)} source={from.areaPy} derived={`= ${num(input.areaPy * PY, 1)}㎡ · 총 전용 ${num(r.gla, 0)}평`} />
            <NumField label="매입 단가" unit="만원/전용평" value={input.pricePerPy} step={10} min={1} onChange={(v) => set("pricePerPy", v)} position={pos.pricePerPy} source={from.pricePerPy} derived={`매입가 ${eok(r.price)} · 세대당 ${num(r.price / input.units / 10000, 2)}억`} />
          </fieldset>

          <fieldset>
            <legend>임대</legend>
            <NumField label="환산월세" unit="만원/평·월" value={input.effRentPerPy} step={0.1} min={0} onChange={(v) => set("effRentPerPy", v)} position={pos.effRentPerPy} source={from.effRentPerPy} derived={`세대당 완전월세 ${num(input.effRentPerPy * input.areaPy, 1)}만원`} />
            <NumField label="세대당 보증금" unit="만원" value={input.depositPerUnit} step={100} min={0} onChange={(v) => set("depositPerUnit", v)} source={from.depositPerUnit} derived={`월세 현금 ${num(r.cashRentPerUnit, 1)}만원/세대 · 승계 보증금 ${eok(r.deposits)}`} />
            <NumField label="전월세전환율" unit="%" value={input.convRatePct} step={0.05} min={0} max={20} onChange={(v) => set("convRatePct", v)} position={pos.convRatePct} source={from.convRatePct} />
            <NumField label="안정화 공실률" unit="%" value={input.vacancyPct} step={0.5} min={0} max={100} onChange={(v) => set("vacancyPct", v)} position={pos.vacancyPct} />
            <NumField label="임대료 성장률" unit="%/년" value={input.rentGrowthPct} step={0.1} min={-10} max={20} onChange={(v) => set("rentGrowthPct", v)} position={pos.rentGrowthPct} source={from.rentGrowthPct} />
          </fieldset>

          <fieldset>
            <legend>비용 · 세금</legend>
            <NumField label="운영비" unit="% EGI" value={input.opexPct} step={0.5} min={0} max={100} onChange={(v) => set("opexPct", v)} position={pos.opexPct} />
            <NumField label="수선 · 교체 적립" unit="% EGI" value={input.capexPct} step={0.5} min={0} max={100} onChange={(v) => set("capexPct", v)} />
            <NumField label="보유세" unit="% 매입가/년" value={input.holdTaxPct} step={0.05} min={0} max={10} onChange={(v) => set("holdTaxPct", v)} derived="재산세·도시지역분·지방교육세 합계 가정. 주거용으로 과세되면 종합부동산세가 추가됩니다" />
            <Seg label="취득세 등" value={acqPreset} options={ACQ_PRESETS} onChange={(v) => { if (v !== "custom") set("acqTaxPct", Number(v)); else set("acqTaxPct", 5); }} />
            {acqPreset === "custom" && <NumField label="취득세 등 직접 입력" unit="% 매입가" value={input.acqTaxPct} step={0.1} min={0} max={20} onChange={(v) => set("acqTaxPct", v)} />}
            <NumField label="기타 취득부대비" unit="% 매입가" value={input.acqCostPct} step={0.1} min={0} max={20} onChange={(v) => set("acqCostPct", v)} derived={`취득부대비 합계 ${eok(r.acqCost)}`} />
            <Seg label="과세 구조" value={input.taxMode} options={[{ id: "conduit", label: "도관 (리츠·펀드)" }, { id: "corp", label: "일반법인" }]} onChange={(v) => set("taxMode", v)} />
            {input.taxMode === "corp" && (
              <>
                <NumField label="법인세 실효세율" unit="%" value={input.corpTaxPct} step={0.1} min={0} max={50} onChange={(v) => set("corpTaxPct", v)} derived="법인세 + 지방소득세. 과표 구간에 맞게 고치십시오" />
                <NumField label="취득원가 중 건물분" unit="%" value={input.buildingRatioPct} step={1} min={0} max={100} onChange={(v) => set("buildingRatioPct", v)} />
                <NumField label="건물 내용연수" unit="년" value={input.deprYears} step={1} min={1} max={60} onChange={(v) => set("deprYears", v)} />
              </>
            )}
          </fieldset>

          <fieldset>
            <legend>금융</legend>
            <NumField label="선순위 대출" unit="% 매입가" value={input.ltvPct} step={1} min={0} max={95} onChange={(v) => set("ltvPct", v)} source={from.ltvPct} derived={`대출 ${eok(r.loan)} · 보증금 포함 실질 LTV ${pct(r.effLtv, 1)}`} />
            <div className="field">
              <label htmlFor="bench">기준금리 지표</label>
              <select id="bench" value={bench} onChange={(e) => onBench(e.target.value as Bench)}>
                {rates?.rates.map((x) => <option key={x.id} value={x.id}>{x.label} {x.value.toFixed(2)}% ({x.asOf})</option>)}
                <option value="manual">직접 입력</option>
              </select>
              <div className="field-src">{rates ? (rates.live ? `한국은행 ECOS OpenAPI · 조회 ${rates.fetchedAt}` : rates.note) : "금리를 불러오는 중…"}</div>
            </div>
            {bench === "manual" && <NumField label="기준금리 직접 입력" unit="%" value={input.baseRatePct} step={0.05} min={0} max={20} onChange={(v) => set("baseRatePct", v)} />}
            <NumField label="가산금리" unit="bp" value={input.spreadBp} step={10} min={0} max={1000} onChange={(v) => set("spreadBp", v)} position={pos.allInRate} derived={`대출금리 ${pctv(allIn, 2)} · 연 이자 ${eok(r.loan * r.rate)} · 만기일시상환`} />
          </fieldset>

          <fieldset>
            <legend>매각</legend>
            <NumField label="보유기간" unit="년" value={input.holdYears} step={1} min={1} max={15} onChange={(v) => set("holdYears", Math.round(v))} />
            <NumField label="Exit Cap" unit="%" value={input.exitCapPct} step={0.05} min={0.5} max={20} onChange={(v) => set("exitCapPct", v)} position={pos.exitCapPct} source={from.exitCapPct} derived={`매각가 ${eok(r.saleValue)} · 매입가 대비 ${pctv((r.saleValue / r.price - 1) * 100, 1, true)}`} />
            <NumField label="매각 비용" unit="% 매각가" value={input.saleCostPct} step={0.1} min={0} max={10} onChange={(v) => set("saleCostPct", v)} />
          </fieldset>
        </div>

        <div className="uw-results" id="results">
          <div className={`verdict v-${verdict.tone}`} role="status">
            <div className="verdict-label">결론</div>
            <p className="verdict-head">{verdict.headline}</p>
            {verdict.lender && <p className="verdict-sub">{verdict.lender}</p>}
            <div className="tally" aria-label="가정 점검 요약">
              <span className="t-agg">공격적 {verdict.tally.aggressive}</span>
              <span className="t-neu">중립 {verdict.tally.neutral}</span>
              <span className="t-con">보수적 {verdict.tally.conservative}</span>
              <span className="t-na">자료 없음 {verdict.tally.na}</span>
            </div>
          </div>
          <div className="kpis four">
            <Kpi label={`Levered IRR${input.taxMode === "corp" ? " · 세후" : ""}`} value={pct(r.leveredIrr)} tone={r.leveredIrr !== null && r.leveredIrr < 0 ? "neg" : undefined} sub={`Unlevered ${pct(r.unleveredIrr)}`} />
            <Kpi label="Equity Multiple" value={mult(r.equityMultiple)} sub={`자기자본 ${eok(r.equity)}`} />
            <Kpi label="평균 Cash-on-Cash" value={pct(r.avgCoC)} sub="보유기간 배당가능 현금 ÷ 자기자본" tone={r.avgCoC !== null && r.avgCoC < 0 ? "neg" : undefined} />
            <Kpi label="최소 DSCR" value={mult(r.minDscr)} sub="NOI ÷ 이자" tone={r.minDscr !== null && r.minDscr < 1 ? "neg" : undefined} />
          </div>

          <dl className="facts">
            <div><dt>진입 Cap (보증금 차감)</dt><dd>{pct(r.goingInCap)}</dd></div>
            <div><dt>Yield on Cost</dt><dd>{pct(r.yieldOnCost)}</dd></div>
            <div><dt>Debt Yield</dt><dd>{pct(r.debtYield)}</dd></div>
            <div><dt>1년차 NOI</dt><dd>{eok(r.years[0]?.noi, 2)}</dd></div>
            <div><dt>손익분기 입주율</dt><dd>{r.breakevenOcc === null ? "–" : pct(r.breakevenOcc, 1)}</dd></div>
          </dl>

          <ul className="notes">{notes.map((n, k) => <li key={k} className={`note-${n.tone}`}>{n.text}</li>)}</ul>

          <h3>조달과 사용</h3>
          <StackBar parts={[
            { label: "선순위 대출", value: r.loan, tone: "debt", note: `${eok(r.loan)} · ${pctv(allIn, 2)}` },
            { label: "승계 보증금", value: r.deposits, tone: "dep", note: `${eok(r.deposits)} · 무이자, 매각 시 승계` },
            { label: "자기자본", value: r.equity, tone: "eq", note: eok(r.equity) },
          ]} />
          <p className="fine">사용 = 매입가 {eok(r.price)} + 취득세 등 {eok(r.price * input.acqTaxPct / 100)} + 기타 부대비 {eok(r.price * input.acqCostPct / 100)} = {eok(r.uses)}</p>

          <h3>자기자본 현금흐름 <span>억원</span></h3>
          <CfBars cfs={r.leveredCfs} />

          <details>
            <summary>연도별 현금흐름표</summary>
            <div className="table-wrap">
              <table className="data tight">
                <thead><tr><th>억원</th>{r.years.map((y) => <th key={y.year} className="num">{y.year}년</th>)}</tr></thead>
                <tbody>
                  {([["가능총수입 (월세)", "pgi", 1], ["(−) 공실", "vacancy", -1], ["(−) 운영비", "opex", -1], ["(−) 수선적립", "capex", -1], ["(−) 보유세", "holdTax", -1], ["NOI", "noi", 1], ["(−) 이자", "interest", -1], ["(−) 법인세", "tax", -1], ["배당가능 현금", "cf", 1]] as const).map(([label, key, sign]) => (
                    <tr key={key} className={key === "noi" || key === "cf" ? "total" : ""}>
                      <td>{label}</td>{r.years.map((y) => <td key={y.year} className="num">{num((sign * y[key]) / 10000, 2)}</td>)}
                    </tr>
                  ))}
                  <tr><td>DSCR</td>{r.years.map((y) => <td key={y.year} className="num">{mult(y.dscr)}</td>)}</tr>
                </tbody>
              </table>
            </div>
            <p className="fine">매각 ({input.holdYears}년 말): 매각가 {eok(r.saleValue)} − 매각비용 {eok(r.saleCost)} − 보증금 {eok(r.deposits)} − 대출 {eok(r.loan)}{input.taxMode === "corp" ? ` − 양도 법인세 ${eok(r.exitTax)}` : ""} = {eok(r.saleNetToEquity)}</p>
          </details>
        </div>
      </div>
    </section>
  );
}
