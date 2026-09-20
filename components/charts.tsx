"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { num } from "@/lib/format";

/** 컨테이너 실제 폭(px)으로 그린다 — 모바일에서 글자가 같이 줄어들지 않게 */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!(hi > lo)) return [lo];
  const t = ticksFor(lo, hi, count);
  return t.length >= 2 || count >= 12 ? t : niceTicks(lo, hi, count * 2); // 눈금이 1개뿐이면 더 촘촘히
}

function ticksFor(lo: number, hi: number, count: number): number[] {
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const start = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export type LinePoint = { label: string; y: number | null; n: number };

export function LineChart({ points, digits = 1, unit, height = 180 }: { points: LinePoint[]; digits?: number; unit: string; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const valid = points.filter((p) => p.y !== null) as { label: string; y: number; n: number }[];
  const pad = { l: 44, r: 12, t: 10, b: 22 };
  let body: ReactNode = null;
  if (w > 0 && valid.length >= 2) {
    const ys = valid.map((p) => p.y);
    const span = Math.max(...ys) - Math.min(...ys) || 1;
    const lo = Math.min(...ys) - span * 0.15;
    const hi = Math.max(...ys) + span * 0.15;
    const X = (k: number) => pad.l + ((w - pad.l - pad.r) * k) / Math.max(1, points.length - 1);
    const Y = (v: number) => pad.t + (height - pad.t - pad.b) * (1 - (v - lo) / (hi - lo));
    const path = points.map((p, k) => (p.y === null ? null : `${X(k).toFixed(1)},${Y(p.y).toFixed(1)}`)).filter(Boolean).join(" L");
    const every = Math.ceil(points.length / (w < 480 ? 4 : 8));
    const h = hover !== null ? points[hover] : null;
    body = (
      <svg width={w} height={height} role="img" aria-label={`${unit} 월별 추이`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const x = e.nativeEvent.offsetX;
          const k = Math.round(((x - pad.l) / (w - pad.l - pad.r)) * (points.length - 1));
          setHover(Math.min(points.length - 1, Math.max(0, k)));
        }}>
        {niceTicks(lo, hi, 3).map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} className="grid" />
            <text x={pad.l - 8} y={Y(t) + 3.5} textAnchor="end" className="tick">{num(t, digits)}</text>
          </g>
        ))}
        {points.map((p, k) => (k % every === 0 ? <text key={k} x={X(k)} y={height - 6} textAnchor="middle" className="tick">{p.label}</text> : null))}
        <path d={`M${path}`} className="line" />
        {h && h.y !== null && hover !== null && (
          <g>
            <line x1={X(hover)} x2={X(hover)} y1={pad.t} y2={height - pad.b} className="cross" />
            <circle cx={X(hover)} cy={Y(h.y)} r={3.5} className="dot" />
          </g>
        )}
      </svg>
    );
  }
  const h = hover !== null ? points[hover] : null;
  return (
    <div ref={ref} className="chart">
      <div className="chart-read">
        {h && h.y !== null ? <><b>{num(h.y, digits)}</b> {unit} · {h.label} · {h.n}건</> : <span className="muted">{unit} · 월별 중앙값</span>}
      </div>
      {body ?? <div className="empty" style={{ height }}>표본이 부족합니다</div>}
    </div>
  );
}

export type ScatterItem = { key: string; x: number; y: number; size: number; label: string; sub: string };

export function Scatter({ items, selected, onPick, xLabel, yLabel, height = 300 }: {
  items: ScatterItem[]; selected: string | null; onPick: (key: string) => void; xLabel: string; yLabel: string; height?: number;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const pad = { l: 44, r: 14, t: 12, b: 34 };
  let body: ReactNode = null;
  if (w > 0 && items.length > 0) {
    const xs = items.map((i) => i.x);
    const ys = items.map((i) => i.y);
    const xr = [Math.min(...xs), Math.max(...xs)];
    const yr = [Math.min(...ys), Math.max(...ys)];
    const xl = xr[0] - (xr[1] - xr[0]) * 0.06, xh = xr[1] + (xr[1] - xr[0]) * 0.06 || xr[1] + 1;
    const yl = yr[0] - (yr[1] - yr[0]) * 0.1, yh = yr[1] + (yr[1] - yr[0]) * 0.1 || yr[1] + 1;
    const X = (v: number) => pad.l + ((w - pad.l - pad.r) * (v - xl)) / (xh - xl);
    const Y = (v: number) => pad.t + (height - pad.t - pad.b) * (1 - (v - yl) / (yh - yl));
    const maxS = Math.max(...items.map((i) => i.size));
    const R = (s: number) => 3 + 9 * Math.sqrt(s / maxS);
    const ordered = [...items].sort((a, b) => b.size - a.size);
    body = (
      <svg width={w} height={height} role="img" aria-label={`${xLabel} 대 ${yLabel} 산점도`}>
        {niceTicks(yl, yh, 4).map((t) => (
          <g key={`y${t}`}>
            <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} className="grid" />
            <text x={pad.l - 8} y={Y(t) + 3.5} textAnchor="end" className="tick">{num(t, 1)}</text>
          </g>
        ))}
        {niceTicks(xl, xh, w < 480 ? 3 : 6).map((t) => (
          <text key={`x${t}`} x={X(t)} y={height - 16} textAnchor="middle" className="tick">{num(t, 0)}</text>
        ))}
        <text x={w - pad.r} y={height - 2} textAnchor="end" className="axis">{xLabel}</text>
        <text x={pad.l} y={9} className="axis">{yLabel}</text>
        {ordered.map((i) => {
          const on = i.key === selected;
          return (
            <circle key={i.key} cx={X(i.x)} cy={Y(i.y)} r={R(i.size)} tabIndex={0} role="button" aria-label={`${i.label} 선택`}
              className={`bubble${on ? " on" : ""}${hover === i.key ? " hover" : ""}`}
              onMouseEnter={() => setHover(i.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i.key)} onBlur={() => setHover(null)}
              onClick={() => onPick(i.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(i.key); } }} />
          );
        })}
      </svg>
    );
  }
  const h = items.find((i) => i.key === (hover ?? selected));
  return (
    <div ref={ref} className="chart">
      <div className="chart-read">{h ? <><b>{h.label}</b> · {h.sub}</> : <span className="muted">원 하나가 단지 하나 · 크기는 임대 거래량 · 눌러서 선택</span>}</div>
      {body ?? <div className="empty" style={{ height }}>매매와 임대가 모두 3건 이상인 단지가 없습니다</div>}
    </div>
  );
}

export type TimePoint = { t: number; v: number; tone: "a" | "b" | "c"; tip: string };

/** x축이 계약일인 산점도 (단지 상세) */
export function TimeScatter({ points, legend, digits = 1, height = 200 }: { points: TimePoint[]; legend: { tone: "a" | "b" | "c"; label: string }[]; digits?: number; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<string | null>(null);
  const pad = { l: 44, r: 12, t: 10, b: 22 };
  const toTime = (ymd: number) => Date.UTC(Math.floor(ymd / 10000), (Math.floor(ymd / 100) % 100) - 1, ymd % 100);
  let body: ReactNode = null;
  if (w > 0 && points.length > 0) {
    const ts = points.map((p) => toTime(p.t));
    const vs = points.map((p) => p.v);
    const t0 = Math.min(...ts), t1 = Math.max(...ts) || t0 + 1;
    const span = Math.max(...vs) - Math.min(...vs) || 1;
    const lo = Math.min(...vs) - span * 0.1, hi = Math.max(...vs) + span * 0.1;
    const X = (t: number) => pad.l + ((w - pad.l - pad.r) * (t - t0)) / Math.max(1, t1 - t0);
    const Y = (v: number) => pad.t + (height - pad.t - pad.b) * (1 - (v - lo) / (hi - lo));
    const d0 = new Date(t0), d1 = new Date(t1);
    const lab = (d: Date) => `${String(d.getUTCFullYear()).slice(2)}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    body = (
      <svg width={w} height={height} role="img" aria-label="계약일별 분포">
        {niceTicks(lo, hi, 3).map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} className="grid" />
            <text x={pad.l - 8} y={Y(t) + 3.5} textAnchor="end" className="tick">{num(t, digits)}</text>
          </g>
        ))}
        <text x={pad.l} y={height - 6} className="tick">{lab(d0)}</text>
        <text x={w - pad.r} y={height - 6} textAnchor="end" className="tick">{lab(d1)}</text>
        {points.map((p, k) => (
          <circle key={k} cx={X(toTime(p.t))} cy={Y(p.v)} r={2.6} className={`pt pt-${p.tone}`} onMouseEnter={() => setTip(p.tip)} onMouseLeave={() => setTip(null)} />
        ))}
      </svg>
    );
  }
  return (
    <div ref={ref} className="chart">
      <div className="chart-read">
        {tip ? <b>{tip}</b> : <span className="legend">{legend.map((l) => <span key={l.tone}><i className={`sw pt-${l.tone}`} />{l.label}</span>)}</span>}
      </div>
      {body ?? <div className="empty" style={{ height }}>거래가 없습니다</div>}
    </div>
  );
}

/** 기준선(threshold)을 경계로 색이 갈리는 민감도 표 */
export function Heat({ rowLabel, colLabel, rows, cols, values, fmt, threshold, scale, centerRow, centerCol, floor }: {
  rowLabel: string; colLabel: string; rows: string[]; cols: string[]; values: (number | null)[][];
  fmt: (v: number | null) => string; threshold: number; scale: number; centerRow: number; centerCol: number;
  /** 이 값 미만이면 "위험" 테두리 (예: IRR 0%, DSCR 1.0) */
  floor?: number;
}) {
  const tone = (v: number | null) => {
    if (v === null) return {};
    const t = Math.max(-1, Math.min(1, (v - threshold) / scale));
    const a = 0.08 + Math.abs(t) * 0.42;
    return { background: t >= 0 ? `rgba(21,94,99,${a.toFixed(3)})` : `rgba(158,42,43,${a.toFixed(3)})` };
  };
  return (
    <div className="heat-wrap">
      <table className="heat">
        <thead>
          <tr><th className="corner">{rowLabel} ＼ {colLabel}</th>{cols.map((c, k) => <th key={c} className={k === centerCol ? "ctr" : ""}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r}>
              <th className={ri === centerRow ? "ctr" : ""}>{r}</th>
              {cols.map((c, ci) => {
                const v = values[ri]?.[ci] ?? null;
                const risk = floor !== undefined && v !== null && v < floor;
                return <td key={c} style={tone(v)} className={`${ri === centerRow && ci === centerCol ? "base" : ""}${risk ? " risk" : ""}`}>{fmt(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StackBar({ parts }: { parts: { label: string; value: number; tone: string; note: string }[] }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  return (
    <div className="stack">
      <div className="stack-bar" role="img" aria-label="자본 구조">
        {parts.map((p) => <span key={p.label} className={`seg seg-${p.tone}`} style={{ width: `${(Math.max(0, p.value) / total) * 100}%` }} />)}
      </div>
      <dl className="stack-legend">
        {parts.map((p) => (
          <div key={p.label}>
            <dt><i className={`sw seg-${p.tone}`} />{p.label}</dt>
            <dd><b>{((Math.max(0, p.value) / total) * 100).toFixed(1)}%</b> · {p.note}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function CfBars({ cfs }: { cfs: number[] }) {
  const max = Math.max(...cfs.map((c) => Math.abs(c))) || 1;
  return (
    <div className="cfbars" role="img" aria-label="자기자본 현금흐름">
      {cfs.map((c, k) => (
        <div key={k} className="cfcol">
          <div className="cfarea">
            <span className={c >= 0 ? "pos" : "neg"} style={{ height: `${(Math.abs(c) / max) * 50}%`, [c >= 0 ? "bottom" : "top"]: "50%" }} />
          </div>
          <div className="cflab">{k === 0 ? "취득" : `${k}년`}</div>
          <div className={`cfval ${c < 0 ? "negtext" : ""}`}>{num(c / 10000, 1)}</div>
        </div>
      ))}
    </div>
  );
}
