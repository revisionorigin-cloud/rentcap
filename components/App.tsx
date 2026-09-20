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
import { underwrite, type UWInput } from "@/lib/underwrite";

const DEFAULT_CODE = "11560";

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
    getJson<Market>(`/api/market?code=${code}&band=${band}`, ac.signal)
      .then((m) => {
        setMarketState({ key: `${code}|${band}`, data: m, error: null });
        if (autofill.current) {
          autofill.current = false;
          const s = suggest(inputRef.current, m, null);
          setInput(s.input);
          setFrom(s.from);
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
    getJson<ComplexDetail>(`/api/complex?code=${code}&key=${encodeURIComponent(selectedKey)}`, ac.signal)
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
  }, []);

  const set = useCallback(<K extends keyof UWInput>(k: K, v: UWInput[K]) => {
    setInput((p) => ({ ...p, [k]: v }));
    setFrom((f) => (k in f ? { ...f, [k]: undefined } : f)); // 손으로 고친 값에서는 출처 표시를 뗀다
  }, []);

  const result = useMemo(() => underwrite(input), [input]);
  const pos = useMemo(() => positions(input, market, result.rate * 100, corpAA), [input, market, result.rate, corpAA]);

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
            <a href="#market">시장</a><a href="#underwrite">언더라이팅</a><a href="#limits">한계선</a><a href="#audit">검증</a>
          </nav>
          <div className="ticker" aria-label="금리">
            {rates?.rates.map((r) => <span key={r.id}><i>{r.label.replace("한국은행 ", "")}</i>{r.value.toFixed(2)}</span>)}
          </div>
        </div>
      </header>

      <main id="top">
        <section className="intro">
          <p className="eyebrow">오피스텔 통매입 · 수익성 검토</p>
          <h1>가정은 데이터가 채우고,<br />그 가정이 시장의 어디에 있는지 함께 봅니다.</h1>
          <p className="intro-lead">
            국토교통부 실거래가에서 임대료·매매가·전월세전환율을, 한국은행 ECOS에서 금리를 가져와 언더라이팅 입력을 채웁니다.
            모든 숫자에 표본 수와 출처가 붙고, 공공데이터로 확인할 수 없는 항목은 추정하지 않고 비워 둡니다.
          </p>
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
          bench={bench} onBench={setBench} targetIrr={target} onShare={onShare} onCsv={onCsv} shareMsg={shareMsg} />

        <LimitsSection input={input} result={result} targetIrr={target} onTarget={setTarget} legalCapPct={legalCapPct} />

        <AuditSection market={market} rates={rates} result={result} live={Boolean(regions?.live)} />
      </main>

      <footer className="foot">
        <div>RENTCAP · 2026 재직자 AI·D 30+ 집중캠프 R.E.VIBE 트랙 1 · 10조</div>
        <div>데이터: 국토교통부 실거래가 · 한국은행 ECOS · 교육용 분석 도구이며 투자 권유가 아닙니다</div>
      </footer>
    </>
  );
}
