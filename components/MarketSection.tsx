"use client";

import { useMemo, useState } from "react";
import { LineChart, Scatter, TimeScatter } from "./charts";
import { Kpi, SectionHead } from "./fields";
import { num, pctv, ymLabel, ymdLabel } from "@/lib/format";
import type { ComplexDetail, ComplexStat, Market } from "@/lib/market";
import { BANDS, type AreaBand } from "@/lib/types";

export type RegionsPayload = {
  live: boolean;
  regions: { code: string; name: string; sgg: { code: string; name: string }[] }[];
  snapshots: { code: string; name: string }[];
};

type SortKey = "nRent" | "nTrade" | "effRentPerPy" | "pricePerPy" | "grossYieldPct" | "gapPct" | "buildYear" | "medArea";

export function MarketSection({ regions, code, band, market, loading, error, selectedKey, detail, legalCapPct, onCode, onBand, onPick, onFillRegion, onFillComplex }: {
  regions: RegionsPayload | null; code: string; band: AreaBand; market: Market | null; loading: boolean; error: string | null;
  selectedKey: string | null; detail: ComplexDetail | null; legalCapPct: number | null;
  onCode: (c: string) => void; onBand: (b: AreaBand) => void; onPick: (key: string | null) => void;
  onFillRegion: () => void; onFillComplex: (c: ComplexStat) => void;
}) {
  const [sort, setSort] = useState<SortKey>("nRent");
  const [showAll, setShowAll] = useState(false);
  const sido = regions?.regions.find((s) => s.sgg.some((g) => g.code === code)) ?? regions?.regions[0];
  const snapSet = useMemo(() => new Set(regions?.snapshots.map((s) => s.code) ?? []), [regions]);

  const sorted = useMemo(() => {
    if (!market) return [];
    return [...market.complexes].sort((a, b) => ((b[sort] ?? -Infinity) as number) - ((a[sort] ?? -Infinity) as number));
  }, [market, sort]);
  const rows = showAll ? sorted : sorted.slice(0, 12);
  const selected = market?.complexes.find((c) => c.key === selectedKey) ?? null;
  const k = market?.kpi;

  const scatterItems = useMemo(
    () => (market?.complexes ?? [])
      .filter((c) => c.pricePerPy !== null && c.grossYieldPct !== null)
      .map((c) => ({
        key: c.key, x: c.pricePerPy as number, y: c.grossYieldPct as number, size: c.nRent, label: c.name,
        sub: `${c.dong} · ${c.buildYear || "?"}년 · 수익률 ${num(c.grossYieldPct, 2)}% · 단가 ${num(c.pricePerPy, 0)}만원/평 · 임대 ${c.nRent}건`,
      })),
    [market],
  );

  const th = (key: SortKey, label: string) => (
    <th className={`num sortable${sort === key ? " on" : ""}`}><button type="button" onClick={() => setSort(key)}>{label}</button></th>
  );

  return (
    <section id="market" className="sec">
      <SectionHead no="01" title="시장" lead="지역을 고르면 국토교통부 실거래가에서 임대료·매매가·전환율·갱신 행태를 계산합니다. 모든 지표 옆에 표본 수를 적습니다."
        aside={market && <button type="button" className="btn" onClick={onFillRegion}>이 지역 시장값으로 가정 채우기</button>} />

      <div className="controls">
        <div className="ctl">
          <label htmlFor="sido">시도</label>
          <select id="sido" value={sido?.code ?? ""} onChange={(e) => {
            const s = regions?.regions.find((x) => x.code === e.target.value);
            const first = s?.sgg.find((g) => regions?.live || snapSet.has(g.code)) ?? s?.sgg[0];
            if (first) onCode(first.code);
          }}>
            {regions?.regions.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </div>
        <div className="ctl">
          <label htmlFor="sgg">시군구</label>
          <select id="sgg" value={code} onChange={(e) => onCode(e.target.value)}>
            {sido?.sgg.map((g) => (
              <option key={g.code} value={g.code}>{g.name}{!regions?.live && !snapSet.has(g.code) ? " — 실시간 전용" : ""}</option>
            ))}
          </select>
        </div>
        <div className="ctl">
          <span className="field-label">전용면적</span>
          <div className="seg-ctl" role="group" aria-label="전용면적 구간">
            {BANDS.map((b) => <button key={b.id} type="button" className={b.id === band ? "on" : ""} aria-pressed={b.id === band} onClick={() => onBand(b.id)}>{b.label}</button>)}
          </div>
        </div>
      </div>

      {error && <div className="notice warn" role="alert">{error}</div>}
      {loading && !market && <div className="notice">실거래가를 불러오는 중입니다…</div>}

      {market && k && (
        <div className={loading ? "dim" : ""}>
          {market.meta.note && <div className="notice">{market.meta.note}</div>}
          <div className="kpis six">
            <Kpi label="전월세전환율 · 시장 역산" value={pctv(market.conv.ratePct, 2)}
              sub={<>{market.conv.method === "implied" ? `전세·월세 쌍 ${num(market.conv.n)}건` : "표본 부족 — 기본값"}{legalCapPct !== null && <> · 법정 상한 {pctv(legalCapPct, 2)}</>}</>} />
            <Kpi label="환산월세 · 전용평당 월" value={`${num(k.effRentPerPy, 2)}만원`} sub={`신규 월세 ${num(k.effRentN)}건 중앙값`} />
            <Kpi label="매매 단가 · 전용평당" value={`${num(k.pricePerPy, 0)}만원`} sub={`매매 ${num(k.priceN)}건 중앙값 · 해제 ${num(market.counts.tradeCanceled)}건 제외`} />
            <Kpi label="총수익률 · Gross" value={pctv(k.grossYieldPct, 2)} sub={`단지별 수익률의 중앙값 · ${num(k.yieldN)}개 단지`} />
            <Kpi label="신규 − 갱신 임대료 격차" value={pctv(k.gapPct, 1, true)} sub={`같은 단지 안에서 비교 · ${num(k.gapN)}개 단지`} />
            <Kpi label="동일 단지 임대료 전년비" value={pctv(k.rentYoYPct, 1, true)} sub={`${num(k.rentYoYN)}개 단지 · 매매가 ${pctv(k.priceYoYPct, 1, true)} (${num(k.priceYoYN)}개)`} />
          </div>

          <dl className="facts">
            <div><dt>갱신 계약 인상률 중앙값</dt><dd>{pctv(k.renewIncrPct, 1, true)} <span>{num(k.renewN)}건</span></dd></div>
            <div><dt>인상률 4.5% 이상 (상한 5% 부근)</dt><dd>{k.renewAtCapShare === null ? "–" : pctv(k.renewAtCapShare * 100, 0)}</dd></div>
            <div><dt>갱신 중 갱신요구권 사용</dt><dd>{k.rrrShare === null ? "–" : pctv(k.rrrShare * 100, 0)}</dd></div>
            <div><dt>월세 비중 (전세 제외)</dt><dd>{k.wolseShare === null ? "–" : pctv(k.wolseShare * 100, 0)}</dd></div>
            <div><dt>매매가 대비 보증금</dt><dd>{pctv(k.depositToPricePct, 1)}</dd></div>
          </dl>

          <div className="grid2">
            <figure>
              <figcaption>환산월세 추이 <span>신규 월세 · 갱신 제외</span></figcaption>
              <LineChart unit="만원/전용평·월" digits={2} points={market.series.map((s) => ({ label: ymLabel(s.ym), y: s.rent, n: s.rentN }))} />
            </figure>
            <figure>
              <figcaption>매매 단가 추이 <span>해제 거래 제외</span></figcaption>
              <LineChart unit="만원/전용평" digits={0} points={market.series.map((s) => ({ label: ymLabel(s.ym), y: s.price, n: s.priceN }))} />
            </figure>
          </div>

          <figure>
            <figcaption>단지별 매매 단가와 총수익률 <span>매매·임대 각 3건 이상인 단지 {scatterItems.length}곳</span></figcaption>
            <Scatter items={scatterItems} selected={selectedKey} onPick={onPick} xLabel="매매 단가 (만원/전용평)" yLabel="총수익률 (%)" />
          </figure>

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>단지</th><th>동</th>{th("buildYear", "준공")}{th("medArea", "전용㎡")}{th("nRent", "임대")}{th("nTrade", "매매")}
                  {th("effRentPerPy", "환산월세")}{th("pricePerPy", "매매단가")}{th("grossYieldPct", "수익률")}{th("gapPct", "신규−갱신")}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.key} className={c.key === selectedKey ? "sel" : ""} onClick={() => onPick(c.key === selectedKey ? null : c.key)}>
                    <td><button type="button" className="rowbtn" aria-pressed={c.key === selectedKey}>{c.name}</button></td>
                    <td className="muted">{c.dong}</td>
                    <td className="num">{c.buildYear || "–"}</td><td className="num">{num(c.medArea, 1)}</td>
                    <td className="num">{num(c.nRent)}</td><td className="num">{num(c.nTrade)}</td>
                    <td className="num">{num(c.effRentPerPy, 2)}</td><td className="num">{num(c.pricePerPy, 0)}</td>
                    <td className="num strong">{pctv(c.grossYieldPct, 2)}</td><td className="num">{pctv(c.gapPct, 1, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-foot">
            <span>최근 12개월 임대 5건 이상 {num(market.counts.complexesListed)}개 단지 · 환산월세·매매단가 단위 만원/전용평 · 열 제목을 누르면 정렬</span>
            {sorted.length > 12 && <button type="button" className="link" onClick={() => setShowAll((v) => !v)}>{showAll ? "상위 12개만" : `전체 ${sorted.length}개 보기`}</button>}
          </div>

          {selected && (
            <div className="detail">
              <div className="detail-head">
                <div>
                  <h3>{selected.name}</h3>
                  <p className="muted">{market.meta.name} {selected.dong} {detail?.jibun ?? ""}{detail?.road ? ` · ${detail.road}` : ""} · {selected.buildYear || "?"}년 준공</p>
                </div>
                <button type="button" className="btn primary" onClick={() => onFillComplex(selected)}>이 단지 값으로 가정 채우기</button>
              </div>
              {!detail && <div className="notice">단지 거래를 불러오는 중입니다…</div>}
              {detail && (
                <>
                  <div className="grid2">
                    <figure>
                      <figcaption>월세 계약 <span>환산월세 만원/전용평·월 · 24개월</span></figcaption>
                      <TimeScatter digits={1} legend={[{ tone: "a", label: "신규" }, { tone: "b", label: "갱신" }, { tone: "c", label: "미표기" }]}
                        points={detail.rentPoints.map((p) => ({ t: p.ymd, v: p.v, tone: p.ctype === 1 ? "a" : p.ctype === 2 ? "b" : "c", tip: `${ymdLabel(p.ymd)} · ${num(p.v, 2)}만원/평 · ${num(p.area, 1)}㎡` }))} />
                    </figure>
                    <figure>
                      <figcaption>매매 <span>만원/전용평 · 해제 제외</span></figcaption>
                      <TimeScatter digits={0} legend={[{ tone: "a", label: "매매" }]}
                        points={detail.tradePoints.map((p) => ({ t: p.ymd, v: p.v, tone: "a", tip: `${ymdLabel(p.ymd)} · ${num(p.v, 0)}만원/평 · ${num(p.area, 1)}㎡` }))} />
                    </figure>
                  </div>
                  <div className="table-wrap">
                    <table className="data">
                      <thead><tr><th>타입 (전용㎡)</th><th className="num">임대</th><th className="num">월세</th><th className="num">보증금 중앙값</th><th className="num">월세 중앙값</th><th className="num">환산월세/평</th><th className="num">매매</th><th className="num">매매가 중앙값</th><th className="num">매매단가/평</th></tr></thead>
                      <tbody>
                        {detail.types.map((t) => (
                          <tr key={t.area}>
                            <td>{t.area}㎡</td><td className="num">{t.nRent}</td><td className="num">{t.nWolse}</td>
                            <td className="num">{num(t.medDeposit)}만원</td><td className="num">{num(t.medRent)}만원</td><td className="num">{num(t.effRentPerPy, 2)}</td>
                            <td className="num">{t.nTrade}</td><td className="num">{t.medPrice === null ? "–" : `${num(t.medPrice / 10000, 2)}억`}</td><td className="num">{num(t.pricePerPy, 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="table-foot"><span>최근 12개월 · 거래가 많은 타입 8개까지 · 환산월세는 지역 전환율 {pctv(detail.convPct, 2)} 적용</span></div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
