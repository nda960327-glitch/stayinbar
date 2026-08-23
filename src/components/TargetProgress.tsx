"use client";

import { won, wonShort, pct } from "@/lib/format";
import type { MonthProjection } from "@/lib/types";

// 목표 달성률 카드 — 진행 바 + 남은 기간 하루 목표 + 달성 시 인센티브 풀 (동기부여용)
export default function TargetProgress({
  totalSales,
  targetSales,
  achievement,
  projection,
  mine, // 직원 화면: 내 예상 인센티브(지금 추세) · 목표 달성 시 · 기여율
}: {
  totalSales: number;
  targetSales: number;
  achievement: number;
  projection?: MonthProjection;
  mine?: { projected: number; atTarget: number; share: number };
}) {
  const p = projection;
  const cur = Math.max(0, Math.min(100, achievement));
  const projPct = p && targetSales > 0 ? (p.projectedSales / targetSales) * 100 : achievement;
  const projClamped = Math.max(cur, Math.min(100, projPct));
  const done = achievement >= 100;
  const partial = !!p?.isPartial;
  const gap = Math.max(0, targetSales - totalSales);

  // 상황별 한 줄 메시지
  let headline = "";
  let tone: "green" | "accent" | "" = "";
  if (done) {
    headline = `🎉 목표 달성! 초과 ${wonShort(totalSales - targetSales)}원 — 넘은 만큼 인센티브 풀이 더 커집니다`;
    tone = "green";
  } else if (!partial) {
    headline = `목표까지 ${wonShort(gap)}원 부족했어요. 다음 달에 다시!`;
  } else if (p && projPct >= 100) {
    headline = `🔥 이 추세면 목표 달성! 남은 ${p.remainingWorkingDays}일, 하루 ${wonShort(p.neededPerDay)}원만 지키면 됩니다`;
    tone = "green";
  } else if (p && projPct >= 85) {
    headline = `💪 거의 다 왔어요 — 남은 ${p.remainingWorkingDays}일 동안 하루 ${wonShort(p.neededPerDay)}원이면 목표 달성`;
    tone = "accent";
  } else if (p) {
    headline = `🚀 남은 ${p.remainingWorkingDays}일 동안 하루 ${wonShort(p.neededPerDay)}원이면 목표 달성 (지금 평균 ${wonShort(p.currentPerDay)}원)`;
  }

  const poolNow = p?.projectedIncentivePool ?? 0;
  const poolAtTarget = p?.incentivePoolAtTarget ?? 0;

  return (
    <div className="stat target-card">
      <div className="target-head">
        <div className="target-num">
          <div className="label">목표 달성률 <span className="muted">· {wonShort(targetSales)}원 목표</span></div>
          <div className="row" style={{ alignItems: "baseline", gap: 10 }}>
            <div className={`value ${done ? "green" : ""}`}>{pct(achievement)}</div>
            {partial && p && !done && (
              <span className="small muted">월말 예상 <strong>{pct(projPct)}</strong></span>
            )}
          </div>
        </div>
        <div className="target-bar-wrap">
          {/* 진행 바: 실선 = 지금까지, 연한 부분 = 월말 예상, 끝 = 목표 */}
          <div className="target-bar" title={`현재 ${pct(achievement)} · 예상 ${pct(projPct)}`}>
            <div className="target-bar-proj" style={{ width: `${projClamped}%` }} />
            <div className={`target-bar-now ${done ? "done" : ""}`} style={{ width: `${cur}%` }} />
            <div className="target-bar-goal" />
          </div>
          <div className="target-scale">
            <span>현재 {wonShort(totalSales)}원</span>
            {partial && p && !done && <span>월말 예상 {wonShort(p.projectedSales)}원</span>}
            <span>목표 {wonShort(targetSales)}원</span>
          </div>
        </div>
      </div>

      {headline && <div className={`target-msg ${tone}`}>{headline}</div>}

      {poolAtTarget > 0 && (
        <div className="foot target-foot">
          {mine ? (
            <>
              목표 달성 시 내 예상 인센티브 <strong>{won(mine.atTarget)}</strong>
              {partial && !done ? ` (지금 추세 ${won(mine.projected)})` : ""}
              {" · "}기여율 {pct(mine.share)}
            </>
          ) : (
            <>
              목표 달성 시 인센티브 풀 <strong>{wonShort(poolAtTarget)}원</strong>
              {partial && !done ? ` (지금 추세 ${wonShort(poolNow)}원)` : ""}
            </>
          )}
        </div>
      )}
    </div>
  );
}
