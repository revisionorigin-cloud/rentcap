import type { Position } from "./assumptions";
import type { Limits, UWInput, UWResult } from "./underwrite";

export type Verdict = {
  tone: "ok" | "warn" | "bad";
  headline: string; // 투자자 관점 한 줄
  lender: string | null; // 대주 관점 한 줄
  tally: { aggressive: number; neutral: number; conservative: number; na: number };
};

const f1 = (v: number) => v.toFixed(1);
const signed = (v: number) => `${v > 0 ? "+" : ""}${f1(v)}%`;
const won = (v: number) => Math.round(v).toLocaleString("ko-KR");

/**
 * 결과를 읽는 사람이 해석하지 않아도 되게 결론을 문장으로 만든다.
 * 숫자는 전부 underwrite()·limits() 결과에서만 가져온다 — 여기서 새로 계산하지 않는다.
 */
export function verdict(
  input: UWInput,
  r: UWResult,
  L: Limits,
  targetIrrPct: number,
  pos: Partial<Record<string, Position>>,
): Verdict {
  const tally = { aggressive: 0, neutral: 0, conservative: 0, na: 0 };
  for (const p of Object.values(pos)) if (p) tally[p.stance]++;

  if (!r.ok || r.leveredIrr === null) {
    return {
      tone: "bad",
      headline: "수익률을 계산할 수 없는 구조입니다 — 대출과 승계 보증금의 합이 취득원가를 넘거나 현금흐름이 성립하지 않습니다.",
      lender: null,
      tally,
    };
  }

  const irrPct = r.leveredIrr * 100;
  const gap = L.maxPricePerPy === null ? null : (L.maxPricePerPy / input.pricePerPy - 1) * 100;
  let headline: string;
  let tone: Verdict["tone"];
  if (irrPct >= targetIrrPct && tally.aggressive > 0) {
    // 숫자는 목표를 넘지만 시장보다 낙관적인 가정 위에 서 있다 — "충족"이라고만 말하면 오해를 부른다
    tone = "warn";
    headline = `IRR ${irrPct.toFixed(2)}%로 목표 ${f1(targetIrrPct)}%를 넘지만, 시장 대비 공격적인 가정 ${tally.aggressive}개에 기대고 있습니다. 그 가정이 실현될 근거를 먼저 확인하십시오.`;
  } else if (irrPct >= targetIrrPct) {
    tone = "ok";
    headline =
      gap === null
        ? `목표 IRR ${f1(targetIrrPct)}%를 충족합니다 (${irrPct.toFixed(2)}%).`
        : `목표 IRR ${f1(targetIrrPct)}%를 충족합니다 (${irrPct.toFixed(2)}%). 매입 단가를 ${won(L.maxPricePerPy as number)}만원/평(${signed(gap)})까지 올려도 목표가 유지됩니다.`;
  } else {
    tone = irrPct < 0 ? "bad" : "warn";
    headline =
      gap === null
        ? `현재 가정으로는 IRR ${irrPct.toFixed(2)}% — 목표 ${f1(targetIrrPct)}%에 못 미치며, 매입 단가 조정만으로는 목표를 맞출 수 없습니다.`
        : `현재 가정으로는 IRR ${irrPct.toFixed(2)}% — 목표 ${f1(targetIrrPct)}%에 못 미칩니다. 매입 단가를 ${won(L.maxPricePerPy as number)}만원/평(${signed(gap)})까지 낮춰야 목표가 맞습니다.`;
  }

  let lender: string | null = null;
  if (r.loan > 0 && L.debtCover) {
    const dscr = r.minDscr === null ? "" : ` · 최소 DSCR ${r.minDscr.toFixed(2)}x${r.minDscr < 1.2 ? " (1.2x 미달)" : ""}`;
    lender = `대주 관점 — 매각가가 매입가 대비 ${signed(L.debtCover.saleVsPrice * 100)}까지 내려가도 대출과 보증금을 전액 상환합니다${dscr}.`;
  } else if (r.loan === 0) {
    lender = "대출 없이 자기자본과 승계 보증금만으로 취득하는 구조입니다.";
  }
  return { tone, headline, lender, tally };
}
