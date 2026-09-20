"use client";

import { useState, type ReactNode } from "react";
import { stanceText, type Position } from "@/lib/assumptions";

export function NumField({ label, value, onChange, unit, step = 1, min = 0, max, position, source, derived }: {
  label: string; value: number; onChange: (v: number) => void; unit: string; step?: number; min?: number; max?: number;
  position?: Position; source?: string; derived?: ReactNode;
}) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  // 바깥에서 값이 바뀌면(시장값 채우기 등) 입력칸도 따라간다. 입력 중인 "4." 같은 중간 상태는 건드리지 않는다
  if (seen !== value) {
    setSeen(value);
    if (Number(text) !== value) setText(String(value));
  }
  const id = `f-${label.replace(/\s+/g, "-")}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-input">
        <input id={id} type="number" inputMode="decimal" value={text} step={step} min={min} max={max}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value !== "" && Number.isFinite(v)) onChange(max !== undefined ? Math.min(max, Math.max(min, v)) : Math.max(min, v));
          }}
          onBlur={() => setText(String(value))} />
        <span className="unit">{unit}</span>
      </div>
      {derived && <div className="field-derived">{derived}</div>}
      {position && (
        <div className={`field-pos st-${position.stance}`}>
          <span className="tag">{stanceText(position.stance)}</span>{position.text}
        </div>
      )}
      {source && <div className="field-src">{source}</div>}
    </div>
  );
}

export function Seg<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="seg-ctl" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} type="button" className={o.id === value ? "on" : ""} aria-pressed={o.id === value} onClick={() => onChange(o.id)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

export function SectionHead({ no, title, lead, aside }: { no: string; title: string; lead: string; aside?: ReactNode }) {
  return (
    <header className="sec-head">
      <div>
        <div className="sec-no">{no}</div>
        <h2>{title}</h2>
        <p className="lead">{lead}</p>
      </div>
      {aside && <div className="sec-aside">{aside}</div>}
    </header>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: "neg" | "pos" }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value${tone ? ` ${tone}` : ""}`}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
