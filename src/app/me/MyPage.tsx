"use client";

import { useCallback, useEffect, useState } from "react";
import { won, wonShort, pct } from "@/lib/format";
import type { EmployeeReport } from "@/lib/types";
import EmployeeDetail from "@/components/EmployeeDetail";

interface MyData {
  role: string;
  month: string;
  availableMonths: string[];
  businessName: string;
  totalSales: number;
  workingDays: number;
  targetSales: number;
  targetAchievement: number;
  me: EmployeeReport | null;
}

export default function MyPage() {
  const [data, setData] = useState<MyData | null>(null);
  const [month, setMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (m?: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(m ? `/api/data?month=${m}` : "/api/data");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "데이터 로드 실패");
        return;
      }
      setData(json);
      setMonth(json.month);
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <div className="card">불러오는 중…</div>;
  if (error) return <div className="card"><div className="notice warn">{error}</div></div>;
  if (!data) return null;

  return (
    <>
      <div className="row spread" style={{ marginBottom: 16 }}>
        <div className="row">
          <span className="muted small">월 선택</span>
          <select
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              load(e.target.value);
            }}
            style={{ width: "auto" }}
          >
            {data.availableMonths.length === 0 && <option value={month}>{month || "데이터 없음"}</option>}
            {data.availableMonths.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 매장 매출 (직원도 열람) */}
      <div className="card">
        <h2>
          이번달 매장 매출 <span className="sub">{month}</span>
        </h2>
        <div className="grid cols-3">
          <div className="stat">
            <div className="label">월 총매출</div>
            <div className="value accent">{wonShort(data.totalSales)}원</div>
            <div className="foot">{won(data.totalSales)}</div>
          </div>
          <div className="stat">
            <div className="label">목표 달성률</div>
            <div className={`value ${data.targetAchievement >= 100 ? "green" : ""}`}>
              {pct(data.targetAchievement)}
            </div>
            <div className="foot">목표 {wonShort(data.targetSales)}원</div>
          </div>
          <div className="stat">
            <div className="label">영업일수</div>
            <div className="value">{data.workingDays}일</div>
          </div>
        </div>
      </div>

      {/* 내 리포트 */}
      {data.me ? (
        <EmployeeDetail emp={data.me} month={month} isOwner={false} />
      ) : (
        <div className="card mt">
          <div className="notice">
            {month} 에 등록된 내 업무일지 기록이 없습니다.
          </div>
        </div>
      )}
    </>
  );
}
