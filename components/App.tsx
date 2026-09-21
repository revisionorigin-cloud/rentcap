"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuditSection } from "./AuditSection";
import { LimitsSection } from "./LimitsSection";
import { MarketSection, type RegionsPayload } from "./MarketSection";
import { UnderwriteSection, type Bench } from "./UnderwriteSection";
import { BASE_INPUT, positions, suggest, type Provenance } from "@/lib/assumptions";
import type { Rates } from "@/lib/ecos";
import type { ComplexDetail, ComplexStat, Market } from "@/lib/market";
import { BANDS, type AreaBand } from "@/lib/types";
import { mult, pct } from "@/lib/format";
import { limits, underwrite, type UWInput } from "@/lib/underwrite";
import { verdict } from "@/lib/verdict";

const DEFAULT_CODE = "11560";
const API_V = "2"; // 응답 형식을 바꾸면 올린다 — CDN·브라우저의 옛 캐시를 피한다

type Shared = { i: UWInput; bench: Bench; target: number };

function encodeShared(s: Shared): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(s)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeShared(t: string): Shared | null {
  try {
    const json = decodeURIComponent(escape(atob(t.replace(/-/g, "+").replace(/_/g, "/"))));
    const s = JSON.parse(json) as Shared;
    if (!s || typeof s.i !== "object") return null;
    // 모르는 키는 버리고, 숫자가 아닌 값은 기본값으로 — 링크로 들어온 값은 신뢰하지 않는다
    const i = { ...BASE_INPUT };
    for (const k of Object.keys(BASE_INPUT) as (keyof UWInput)[]) {
      const v = (s.i as Record<string, unknown>)[k];
      if (k === "taxMode") { if (v === "conduit" || v === "corp") i.taxMode = v; }
      else if (typeof v === "number" && Number.isFinite(v)) (i[k] as number) = v;
    }
    const bench: Bench = ["cd91", "ktb3", "base", "corpAA", "manual"].includes(s.bench) ? s.bench : "cd91";
    return { i, bench, target: typeof s.target === "number" && Number.isFinite(s.target) ? s.target : 8 };
  } catch {
    return null;
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `요청 실패 (${res.status})`);
  return body;
}

type Initial = { code: string; band: AreaBand; cx: string | null; shared: Shared | null };

/** 주소창에서 첫 상태를 읽는다. 이 컴포넌트는 브라우저에서만 렌더된다 (ClientApp 참고) */
function readInitial(): Initial {
  const q = new URLSearchParams(window.location.search);
  const c = q.get("code");
  const b = q.get("band");
  const u = q.get("u");
  return {
    code: c && /^\d{5}$/.test(c) ? c : DEFAULT_CODE,
    band: b && BANDS.some((x) => x.id === b) ? (b as AreaBand) : "all",
    cx: q.get("cx"),
    shared: u ? decodeShared(u) : null,
  };
}

type Loaded<T> = { key: string; data: T | null; error: string | null };

export default function App() {
  const [init] = useState(readInitial);
  const [regions, setRegions] = useState<RegionsPayload | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [code, setCode] = useState(init.code);
  const [band, setBand] = useState<AreaBand>(init.band);
  const [marketState, setMarketState] = useState<Loaded<Market>>({ key: "", data: null, error: null });
  const [selectedKey, setSelectedKey] = useState<string | null>(init.cx);
  const [detailState, setDetailState] = useState<Loaded<ComplexDetail>>({ key: "", data: null, error: null });
  const [rawInput, setInput] = useState<UWInput>(init.shared?.i ?? BASE_INPUT);
  const [from, setFrom] = useState<Provenance>({});
  const [bench, setBench] = useState<Bench>(init.shared?.bench ?? "cd91");
  const [target, setTarget] = useState(init.shared?.target ?? 8);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  // 지금 입력이 어디서 왔는지 (지역 시장값 / 특정 단지 / 공유 링크) 와 그 뒤 손으로 고쳤는지
  const [basis, setBasis] = useState<{ label: string; complexKey: string | null } | null>(init.shared ? { label: "공유 링크로 받은 가정", complexKey: null } : null);
  const [edited, setEdited] = useState(false);
  const [activeSec, setActiveSec] = useState("market");
  // 공유 링크로 들어왔으면 받은 가정을 그대로 두고, 아니면 첫 시장 데이터로 한 번만 채운다
  const autofill = useRef(init.shared === null);
  const inputRef = useRef(rawInput);

  useEffect(() => {
    getJson<RegionsPayload>("/api/regions").then(setRegions).catch(() => setRegions(null));
    getJson<Rates>("/api/rates").then(setRates).catch(() => setRates(null));
  }, []);

  // ── 시장 조회. 상태는 응답이 왔을 때만 바꾼다 — "불러오는 중"은 요청 키와 응답 키를 비교해 파생한다
  const marketKey = `${code}|${band}`;
  useEffect(() => {
    const ac = new AbortController();
    getJson<Market>(`/api/market?v=${API_V}&code=${code}&band=${band}`, ac.signal)
      .then((m) => {
        setMarketState({ key: `${code}|${band}`, data: m, error: null });
        if (autofill.current) {
          autofill.current = false;
          try {
            const s = suggest(inputRef.current, m, null);
            setInput(s.input);
            setFrom(s.from);
            setBasis({ label: `${m.meta.name} 시장값`, complexKey: null });
          } catch {
            // 자동 채우기가 실패해도 시장 화면은 보여준다 — 기본 가정으로 시작
          }
        }
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setMarketState({ key: `${code}|${band}`, data: null, error: e instanceof Error ? e.message : "조회에 실패했습니다." });
      });
    return () => ac.abort();
  }, [code, band]);
  const loading = marketState.key !== marketKey;
  const market = marketState.data;
  const error = loading ? null : marketState.error;

  // ── 단지 상세
  const detailKey = selectedKey ? `${code}|${selectedKey}` : "";
  useEffect(() => {
    if (!selectedKey) return;
    const ac = new AbortController();
    getJson<ComplexDetail>(`/api/complex?v=${API_V}&code=${code}&key=${encodeURIComponent(selectedKey)}`, ac.signal)
      .then((d) => setDetailState({ key: `${code}|${selectedKey}`, data: d, error: null }))
      .catch(() => { if (!ac.signal.aborted) setSelectedKey(null); });
    return () => ac.abort();
  }, [code, selectedKey]);
  const detail = detailKey !== "" && detailState.key === detailKey ? detailState.data : null;

  const benchRate = bench === "manual" ? null : rates?.rates.find((r) => r.id === bench)?.value ?? null;
  const baseRate = rates?.rates.find((r) => r.id === "base")?.value ?? null;
  const corpAA = rates?.rates.find((r) => r.id === "corpAA")?.value ?? null;
  const legalCapPct = baseRate === null ? null : Math.min(10, baseRate + 2);

  // 금리 지표를 고르면 그 실시간 값이 기준금리로 쓰인다 (직접 입력일 때만 입력값 사용)
  const input = useMemo<UWInput>(() => (benchRate === null ? rawInput : { ...rawInput, baseRatePct: benchRate }), [rawInput, benchRate]);
  useEffect(() => { inputRef.current = input; }, [input]);

  const fill = useCallback((m: Market, c: ComplexStat | null) => {
    const s = suggest(inputRef.current, m, c);
    setInput(s.input);
    setFrom(s.from);
    setBasis({ label: c ? `${c.name} (${m.meta.name.split(" ").pop()})` : `${m.meta.name} 시장값`, complexKey: c?.key ?? null });
    setEdited(false);
  }, []);

  const set = useCallback(<K extends keyof UWInput>(k: K, v: UWInput[K]) => {
    setInput((p) => ({ ...p, [k]: v }));
    setFrom((f) => (k in f ? { ...f, [k]: undefined } : f)); // 손으로 고친 값에서는 출처 표시를 뗀다
    setEdited(true);
  }, []);

  const result = useMemo(() => underwrite(input), [input]);
  const pos = useMemo(() => positions(input, market, result.rate * 100, corpAA), [input, market, result.rate, corpAA]);
  const L = useMemo(() => limits(input, target), [input, target]);
  const V = useMemo(() => verdict(input, result, L, target, pos), [input, result, L, target, pos]);

  const onReset = () => {
    if (!market) return;
    const c = basis?.complexKey ? market.complexes.find((x) => x.key === basis.complexKey) ?? null : null;
    fill(market, c);
  };

  // 상단 메뉴에 지금 보고 있는 섹션을 표시한다
  useEffect(() => {
    const ids = ["market", "underwrite", "limits", "audit"];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActiveSec(e.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  // ── URL 동기화 (지역·면적·단지만. 가정 수치는 "링크 복사"를 눌렀을 때만 URL에 넣는다)
  useEffect(() => {
    const q = new URLSearchParams();
    q.set("code", code);
    if (band !== "all") q.set("band", band);
    if (selectedKey) q.set("cx", selectedKey);
    window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
  }, [code, band, selectedKey]);

  const onShare = async () => {
    const q = new URLSearchParams({ code });
    if (band !== "all") q.set("band", band);
    if (selectedKey) q.set("cx", selectedKey);
    q.set("u", encodeShared({ i: input, bench, target }));
    const url = `${window.location.origin}${window.location.pathname}?${q.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg("복사했습니다");
    } catch {
      window.prompt("아래 링크를 복사하십시오", url);
      setShareMsg(null);
    }
    window.setTimeout(() => setShareMsg(null), 2000);
  };

  const onCsv = () => {
    const head = ["구분", "취득", ...result.years.map((y) => `${y.year}년`)];
    const line = (label: string, first: number | string, f: (k: number) => number) => [label, first, ...result.years.map((_, k) => Math.round(f(k)))];
    const rows = [
      head,
      line("가능총수입", "", (k) => result.years[k].pgi), line("공실", "", (k) => -result.years[k].vacancy),
      line("운영비", "", (k) => -result.years[k].opex), line("수선적립", "", (k) => -result.years[k].capex),
      line("보유세", "", (k) => -result.years[k].holdTax), line("NOI", "", (k) => result.years[k].noi),
      line("이자", "", (k) => -result.years[k].interest), line("법인세", "", (k) => -result.years[k].tax),
      line("자기자본 현금흐름(매각 포함)", Math.round(result.leveredCfs[0]), (k) => result.leveredCfs[k + 1]),
    ];
    const csv = "﻿" + ["단위: 만원", ...rows.map((r) => r.join(","))].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "rentcap-cashflow.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const live = market?.meta.mode === "live";
  return (
    <>
      <header className="mast">
        <div className="mast-in">
          <a className="brand" href="#top"><b>RENTCAP</b><span>임대주택 언더라이팅</span></a>
          <nav aria-label="섹션">
            {([["market", "시장"], ["underwrite", "언더라이팅"], ["limits", "한계선"], ["audit", "검증"]] as const).map(([id, label]) => (
              <a key={id} href={`#${id}`} className={activeSec === id ? "on" : ""} aria-current={activeSec === id ? "true" : undefined}>{label}</a>
            ))}
          </nav>
          <div className="ticker" aria-label="금리">
            {rates?.rates.map((r) => <span key={r.id}><i>{r.label.replace("한국은행 ", "")}</i>{r.value.toFixed(2)}</span>)}
          </div>
        </div>
      </header>

      <main id="top">
        <section className="intro">
          <p className="eyebrow">RENTCAP · 임대주택 언더라이팅</p>
          <h1>기관투자자의 오피스텔 매입 검토</h1>
          <p className="intro-lead">
            국토교통부 실거래가와 한국은행 금리를 실시간으로 불러와, 다음 3단계로 매입 가격과 수익률을 검토합니다.
          </p>
          <ol className="steps">
            <li><a href="#market"><b>STEP 1</b><span><strong>시장 확인</strong>지역을 고르면 임대료 · 매매가 · 전월세전환율 · 수익률이 나옵니다</span></a></li>
            <li><a href="#underwrite"><b>STEP 2</b><span><strong>수익률 계산</strong>시장값으로 채워진 가정을 내 딜에 맞게 고칩니다. 가정마다 시장 대비 위치가 표시됩니다</span></a></li>
            <li><a href="#limits"><b>STEP 3</b><span><strong>매입가 · 한계선 확인</strong>목표 수익률에 맞는 매입가와, 어디까지 나빠져도 버티는지 확인합니다</span></a></li>
          </ol>
          <div className="status">
            <span className={`chip ${live ? "live" : ""}`}>{market ? (live ? "실거래가 · OpenAPI 실시간" : "실거래가 · 국토부 공개 CSV 스냅샷") : "실거래가 · 불러오는 중"}</span>
            <span className={`chip ${rates?.live ? "live" : ""}`}>{rates ? (rates.live ? `금리 · ECOS 실시간 ${rates.fetchedAt}` : "금리 · 마지막 확인값") : "금리 · 불러오는 중"}</span>
            {market && <span className="chip">{market.meta.name} · {market.meta.from} ~ {market.meta.to}</span>}
          </div>
        </section>

        <MarketSection regions={regions} code={code} band={band} market={market} loading={loading} error={error}
          selectedKey={selectedKey} detail={detail} legalCapPct={legalCapPct}
          onCode={(c) => { setSelectedKey(null); setCode(c); }} onBand={setBand} onPick={setSelectedKey}
          onFillRegion={() => { if (market) { fill(market, null); document.getElementById("underwrite")?.scrollIntoView({ behavior: "smooth" }); } }}
          onFillComplex={(c) => { if (market) { fill(market, c); document.getElementById("underwrite")?.scrollIntoView({ behavior: "smooth" }); } }} />

        <UnderwriteSection input={input} set={set} result={result} pos={pos} from={from} rates={rates}
          bench={bench} onBench={setBench} onShare={onShare} onCsv={onCsv} shareMsg={shareMsg}
          verdict={V} basis={basis?.label ?? null} edited={edited} onReset={onReset} />

        <LimitsSection input={input} result={result} L={L} targetIrr={target} onTarget={setTarget} legalCapPct={legalCapPct} />

        <AuditSection market={market} rates={rates} result={result} live={Boolean(regions?.live)} />
      </main>

      <a className={`mbar v-${V.tone}`} href="#results" aria-label="결과로 이동">
        <span><i>IRR</i>{pct(result.leveredIrr)}</span>
        <span><i>EM</i>{mult(result.equityMultiple)}</span>
        <span><i>DSCR</i>{mult(result.minDscr)}</span>
        <span className="mbar-go">결과 ↑</span>
      </a>

      <footer className="foot">
        <div>RENTCAP · 2026 재직자 AI·D 30+ 집중캠프 R.E.VIBE 트랙 1 · 10조</div>
        <div>데이터: 국토교통부 실거래가 · 한국은행 ECOS · 교육용 분석 도구이며 투자 권유가 아닙니다</div>
      </footer>
    </>
  );
}
