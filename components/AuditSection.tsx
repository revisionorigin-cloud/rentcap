"use client";

import { SectionHead } from "./fields";
import type { Rates } from "@/lib/ecos";
import { num, pctv, ymdLabel } from "@/lib/format";
import type { Market } from "@/lib/market";
import { BANDS } from "@/lib/types";
import type { UWResult } from "@/lib/underwrite";

export function AuditSection({ market, rates, result, live }: { market: Market | null; rates: Rates | null; result: UWResult; live: boolean }) {
  const c = market?.counts;
  const band = BANDS.find((b) => b.id === market?.band)?.label ?? "전체";
  return (
    <section id="audit" className="sec">
      <SectionHead no="04" title="검증과 출처" lead="숫자 하나가 틀린 검토서는 없는 것보다 위험합니다. 데이터가 어디서 왔고, 무엇을 뺐고, 계산이 맞는지 여기서 확인합니다." />

      <div className="audit">
        <div>
          <h3>데이터 계보</h3>
          <table className="data tight kv">
            <tbody>
              <tr><td>임대 · 매매</td><td>{market?.meta.source ?? "–"}</td></tr>
              <tr><td>수집 방식</td><td>{market ? (market.meta.mode === "live" ? "OpenAPI 실시간 호출 · 서버에서 하루 캐시" : "국토교통부 공개 CSV를 내려받아 만든 스냅샷") : "–"}</td></tr>
              <tr><td>대상 · 기간</td><td>{market ? `${market.meta.name} · ${market.meta.asset} · ${market.meta.from} ~ ${market.meta.to} (계약일 기준)` : "–"}</td></tr>
              <tr><td>조회일</td><td>{market?.meta.fetchedAt ?? "–"}</td></tr>
              <tr><td>최근 12개월 창</td><td>{market ? `${ymdLabel(market.window.recentFrom)} 다음 날 ~ ${ymdLabel(market.window.latest)}` : "–"}</td></tr>
              <tr><td>임대 계약</td><td>{c ? `전체 ${num(c.rentTotal)}건 → 면적 구간(${band}) ${num(c.rentInBand)}건 → 최근 12개월 ${num(c.rentRecent)}건 (월세 ${num(c.wolseRecent)}건)` : "–"}</td></tr>
              <tr><td>매매</td><td>{c ? `전체 ${num(c.tradeTotal)}건 − 해제 신고 ${num(c.tradeCanceled)}건 → 면적 구간 ${num(c.tradeInBand)}건 → 최근 12개월 ${num(c.tradeRecent)}건` : "–"}</td></tr>
              <tr><td>단지</td><td>{c ? `${num(c.complexes)}개 중 임대 5건 이상 ${num(c.complexesListed)}개를 표에 표시` : "–"}</td></tr>
              <tr><td>금리</td><td>{rates ? `한국은행 ECOS OpenAPI (722Y001 기준금리 · 817Y002 시장금리) · ${rates.live ? `조회 ${rates.fetchedAt}` : "호출 실패 — 마지막 확인값"}${rates.keyKind === "sample" ? " · 한국은행 공개 시험키 사용" : ""}` : "–"}</td></tr>
            </tbody>
          </table>

          <h3>제외 · 보정 기준</h3>
          <ul className="plain">
            <li>해제 사유가 신고된 매매는 모든 통계에서 제외합니다.</li>
            <li>지역 분포(단가·환산월세·갱신 인상률)는 표본 20건 이상일 때 상·하위 1%를 잘라냅니다. 단지별 중앙값은 자르지 않습니다.</li>
            <li>단지 통계는 최소 표본을 둡니다 — 환산월세 3건, 매매 단가 3건, 표 게재는 임대 5건. 미달하면 값을 비웁니다. 추정으로 채우지 않습니다.</li>
            <li>임대료 수준은 <b>신규 월세</b>(계약구분이 갱신이 아닌 계약)로 잽니다. 갱신 계약은 5% 상한에 묶여 시세보다 낮기 때문입니다. 신규가 3건 미만인 단지만 전체 월세를 씁니다.</li>
            <li>전년비는 <b>같은 단지끼리</b> 비교한 뒤 중앙값을 취합니다 (임대 각 5건·매매 각 3건 이상). 거래되는 단지 구성이 바뀌어 생기는 착시를 막습니다.</li>
            <li>실거래가는 계약일 기준이고 신고 기한이 30일이라, 최근 한 달 치는 아직 다 들어오지 않았습니다.</li>
          </ul>
        </div>

        <div>
          <h3>산식</h3>
          <table className="data tight kv">
            <tbody>
              <tr><td>전용평</td><td>전용면적(㎡) ÷ 3.3058</td></tr>
              <tr><td>전월세전환율</td><td>같은 단지·같은 면적(㎡ 반올림)에서 r = 월세 × 12 ÷ (전세 보증금 중앙값 − 월세 보증금). 전세 2건 이상 · 보증금 차 500만원 이상 · 2% &lt; r &lt; 12%만 채택, 지역 중앙값. 유효 30건 미만이면 기본값 5.5%로 두고 그렇게 표시</td></tr>
              <tr><td>환산월세</td><td>(월세 + 보증금 × 전환율 ÷ 12) ÷ 전용평</td></tr>
              <tr><td>총수익률</td><td>같은 단지·같은 타입(전용㎡ 반올림)에서 세대당 환산월세 × 12 ÷ 매매가. 임대·매매 각 2건 이상인 타입만 거래량으로 가중평균 — 임대는 소형, 매매는 중대형에 쏠려 생기는 왜곡을 막습니다. 맞는 타입이 없는 단지만 평당 비율로 대체. 지역값은 단지별 수익률의 중앙값</td></tr>
              <tr><td>월세 현금</td><td>환산월세 × 전용평 − 보증금 × 전환율 ÷ 12</td></tr>
              <tr><td>NOI</td><td>월세 현금 × 12 × 세대수 × (1 − 공실률) × (1 − 운영비율 − 수선적립률) − 보유세</td></tr>
              <tr><td>Cap rate</td><td>NOI ÷ (가격 − 보증금) — 국내 관행인 보증금 차감 기준</td></tr>
              <tr><td>매각가</td><td>매각 다음 해 NOI ÷ Exit Cap + 보증금</td></tr>
              <tr><td>자기자본</td><td>매입가 + 취득부대비 − 대출 − 승계 보증금</td></tr>
              <tr><td>DSCR</td><td>NOI ÷ 이자 (만기일시상환)</td></tr>
              <tr><td>IRR</td><td>이분법으로 NPV = 0 인 할인율 (−99% ~ 1000%)</td></tr>
            </tbody>
          </table>

          <h3>모델 검증 <span>지금 화면의 입력값으로 실행</span></h3>
          <ul className="checks">
            {result.checks.map((k) => (
              <li key={k.label} className={k.pass === null ? "na" : k.pass ? "pass" : "fail"}><b>{k.pass === null ? "N/A" : k.pass ? "PASS" : "FAIL"}</b><span>{k.label}<small>{k.detail}</small></span></li>
            ))}
          </ul>
          <p className="fine">저장소의 단위 테스트(npm test)가 손계산 대조 · 한계선 역산 · 전환율 복원 · OpenAPI 응답 해석 · 해제 거래 제외를 확인합니다. IRR 함수는 1회차 교재의 검증값(센텀 리버뷰 13.58%)으로 대조했습니다.</p>
        </div>
      </div>

      <div className="audit">
        <div>
          <h3>법정 기준</h3>
          <ul className="plain">
            <li><b>전월세전환율 상한</b> — 연 10%와 한국은행 기준금리 + 2%p 중 낮은 비율. 계약 중 보증금을 월세로 돌릴 때 적용됩니다. 주택임대차보호법 제7조의2, 시행령 제9조.</li>
            <li><b>갱신 시 증액 상한</b> — 약정 차임·보증금의 20분의 1(5%). 같은 법 제7조 제2항. 계약갱신요구권은 1회, 제6조의3. 주거용으로 쓰는 오피스텔에도 적용됩니다.</li>
            <li><b>취득세</b> — 오피스텔은 건축물로 보아 4.6%(취득세 4% + 지방교육세 0.4% + 농어촌특별세 0.2%). 12.4%는 법인이 주택(도시형생활주택 등, 전용 85㎡ 이하)을 살 때의 중과세율로 비교용입니다. 지방세법 제11조·제13조의2.</li>
            <li><b>도관 과세</b> — 리츠·부동산펀드가 배당가능이익의 90% 이상을 배당하면 그 금액을 소득에서 공제합니다. 법인세법 제51조의2. 이 모델은 도관이면 법인 단계 세금을 0으로 둡니다.</li>
          </ul>
        </div>
        <div>
          <h3>이 검토가 확인하지 못한 것</h3>
          <ul className="plain">
            <li>공실률 · 운영비 · 수선비 — 공공데이터에 없습니다. 현장 실사와 임대관리 견적으로 대체해야 합니다.</li>
            <li>세대수 · 호실 구성 — 실거래가는 거래된 호실만 보여줍니다. 건축물대장으로 확인하십시오.</li>
            <li>통매입 할인·프리미엄 — 매매 단가는 개별 호실 거래입니다. 한 동을 통째로 사는 가격과 다를 수 있습니다.</li>
            <li>관리비 수지 · 주차 등 부대수입, 임대 중개보수, 명도 비용은 넣지 않았습니다.</li>
            <li>보증금은 보유기간 내내 일정하다고 가정했고, 현금흐름은 연 단위입니다.</li>
            <li>세무는 단순화했습니다 — 결손금 이월, 대도시 법인 중과, 종합부동산세, 부가가치세는 별도 검토가 필요합니다.</li>
          </ul>
          <h3>보안</h3>
          <ul className="plain">
            <li>공공데이터포털·ECOS 인증키는 서버 환경변수에만 있고 브라우저로 전달되지 않습니다{live ? "" : " (현재 공공데이터포털 키는 미설정 — 스냅샷 모드)"}.</li>
            <li>언더라이팅 입력값은 서버로 전송하지 않습니다. 공유 링크를 만들 때만 가정 수치가 URL에 들어갑니다.</li>
          </ul>
        </div>
      </div>
      {market && <p className="fine">기준 전환율 {pctv(market.conv.ratePct, 2)} · 본 자료는 공개 데이터에 기반한 교육용 분석 도구이며 투자 권유가 아닙니다. 실제 의사결정에는 실사와 전문가 검토가 필요합니다.</p>}
    </section>
  );
}
