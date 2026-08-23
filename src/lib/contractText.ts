import type { AppConfig } from "./types";

// 근로계약서 【인센티브】 조항 문구
// 설정에 직접 쓴 문구(contractIncentiveClause)가 있으면 그걸 쓰고, 없으면 인센티브 설정값으로 만든다.
export function incentiveClauseText(config: AppConfig): string {
  const custom = (config.contractIncentiveClause ?? "").trim();
  if (custom) return custom;

  const rate = config.incentiveProfitRate ?? 0;
  const start = config.incentiveProfitStartMonth ?? "";
  const pct = Math.round(rate * 100);
  const [y, m] = start.split("-");
  const startLabel = y && m ? `${y}년 ${Number(m)}월분 급여` : "";

  if (rate > 0 && startLabel) {
    return [
      `① "갑"은 "을"에게 기본급 외에 인센티브를 지급한다.`,
      `② ${startLabel}부터 매월 인센티브 차감 전 순이익(당월 매출에서 급여·고정비·부가세·카드수수료·재료비 및 주류비·마케팅비를 뺀 금액)의 ${pct}%를 인센티브 풀(총액)로 편성한다.`,
      `③ 위 풀은 직원 각자가 순이익의 ${pct}%를 받는 것이 아니라, 풀 총액을 당월 업무일지 기여율(본인 기여점수 ÷ 전 직원 기여점수 합계)에 따라 나누어 지급한다. (예: 풀 100만원, 기여율 40% → 40만원)`,
      `④ 당월 순이익이 0 이하인 경우 해당 월의 인센티브는 지급하지 않는다.`,
      `⑤ 인센티브는 기본급과 함께 임금 지급일에 지급하며, 인센티브 비율과 산정 기준은 "갑"이 사전에 공지한 후 조정할 수 있다.`,
    ].join("\n");
  }

  const p3 = Math.round((config.incentivePool3Rate ?? 0) * 100);
  const p2 = Math.round((config.incentivePool2Rate ?? 0) * 100);
  return [
    `① "갑"은 "을"에게 기본급 외에 인센티브를 지급한다.`,
    `② 매월 매출의 ${p2}%를 인센티브 풀로 편성하여 업무일지 기여점수 비율에 따라 전 직원에게 분배하고, 매출의 ${p3}%는 지정된 직원에게 균등 지급한다.`,
    `③ 인센티브는 기본급과 함께 임금 지급일에 지급하며, 인센티브 비율과 산정 기준은 "갑"이 사전에 공지한 후 조정할 수 있다.`,
  ].join("\n");
}
