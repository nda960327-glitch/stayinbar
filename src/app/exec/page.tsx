"use client";

import { useCallback, useEffect, useState } from "react";
import { won, wonShort, pct } from "@/lib/format";
import type { MonthlyResult } from "@/lib/types";

type ExecData = MonthlyResult & { businessName: string; source: string; updatedAt: string };

export default function ExecPage() {
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [data, setData] = useState<ExecData | null>(null);
  const [month, setMonth] = useState("");
  const [loading, setLoading] = useState(false);
  const [showMaterial, setShowMaterial] = useState(false);

  // session persistence
  useEffect(() => {
    if (sessionStorage.getItem("exec_authed") === "1") {
      setAuthed(true);
    }
  }, []);

  const loadData = useCallback(async (m?: string) => {
    setLoading(true);
    try {
      const url = m ? `/api/data?month=${m}` : "/api/data";
      const res = await fetch(url);
      const json = await res.json();
      setData(json);
      setMonth(json.month);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) loadData();
  }, [authed, loadData]);

  async function login() {
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/exec-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        sessionStorage.setItem("exec_authed", "1");
        setAuthed(true);
      } else {
        setAuthError("PIN이 올바르지 않습니다.");
      }
    } finally {
      setAuthLoading(false);
    }
  }

  /* ── Login Screen ── */
  if (!authed) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-0)",
      }}>
        <div className="card" style={{ width: 360, textAlign: "center" }}>
          <div style={{ fontSize: "2rem", marginBottom: 8 }}>🔐</div>
          <h1 style={{ fontSize: "1.3rem", marginBottom: 4 }}>임원 대시보드</h1>
          <p className="muted small" style={{ marginBottom: 24 }}>STAY IN BAR · 관리자 전용</p>
          <input
            type="password"
            placeholder="PIN 입력"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            style={{ textAlign: "center", letterSpacing: 6, fontSize: "1.2rem", marginBottom: 12 }}
          />
          {authError && <p style={{ color: "var(--red)", marginBottom: 8, fontSize: "0.85rem" }}>{authError}</p>}
          <button className="btn" style={{ width: "100%" }} onClick={login} disabled={authLoading || !pin}>
            {authLoading ? "확인 중…" : "입장"}
          </button>
          <p className="muted small" style={{ marginTop: 16 }}>초기 PIN: 5678 · 설정에서 변경 가능</p>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return <div className="card" style={{ textAlign: "center", padding: 40 }}>📊 데이터 불러오는 중…</div>;
  }
  if (!data) return null;

  const o = data.owner;

  return (
    <>
      {/* Header */}
      <div className="row spread" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.4rem" }}>
            {data.businessName}
            <span className="sub" style={{ marginLeft: 8 }}>임원 대시보드</span>
          </h1>
          <p className="muted small">
            소스: {data.source === "google-sheet" ? "구글시트" : "업로드"}{" "}
            {data.updatedAt ? `· ${new Date(data.updatedAt).toLocaleString("ko-KR")}` : ""}
          </p>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <select
            value={month}
            onChange={(e) => { setMonth(e.target.value); loadData(e.target.value); }}
            style={{ width: "auto" }}
          >
            {data.availableMonths.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button
            className="btn ghost sm"
            onClick={() => { sessionStorage.removeItem("exec_authed"); setAuthed(false); }}
          >
            로그아웃
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid cols-4">
        <div className="stat">
          <div className="label">월 총매출</div>
          <div className="value accent">{wonShort(o.totalSales)}원</div>
          <div className="foot">{won(o.totalSales)}</div>
        </div>
        <div className="stat">
          <div className="label">목표 달성률</div>
          <div className={`value ${o.targetAchievement >= 100 ? "green" : ""}`}>
            {pct(o.targetAchievement)}
          </div>
          <div className="foot">목표 {wonShort(o.targetSales)}원</div>
        </div>
        <div className="stat">
          <div className="label">영업일수</div>
          <div className="value">{o.workingDays}일</div>
          <div className="foot">
            1일 목표 {wonShort(o.workingDays > 0 ? Math.round(o.targetSales / o.workingDays) : 0)}원
          </div>
        </div>
        <div className="stat">
          <div className="label">최종 순수익</div>
          <div className={`value ${o.netProfit >= 0 ? "green" : "red"}`}>
            {wonShort(o.netProfit)}원
          </div>
          <div className="foot">{won(o.netProfit)}</div>
        </div>
      </div>

      {/* P&L */}
      <div className="card mt">
        <h2>손익 계산 <span className="sub">{month}</span></h2>

        {[
          { label: "월 총매출", value: o.totalSales, plus: true },
          { label: "총 급여 (세전)", value: o.totalPayroll },
          { label: "총 인센티브", value: o.totalIncentive },
          { label: "고정비 (월세 등)", value: o.fixedCost },
          { label: "부가세 (10%)", value: o.vat },
          { label: "카드수수료 (2%)", value: o.cardFee },
          { label: "재료비 + 주류비", value: data.materialCost },
          { label: "마케팅 및 기타", value: o.marketingCost },
        ].map(({ label, value, plus }) => (
          <div className="pnl-line" key={label}>
            <span className="name">{label}</span>
            <span className={`amt ${plus ? "" : "minus"}`}>
              {plus ? "" : "- "}{won(value)}
            </span>
          </div>
        ))}

        {/* 재료비 상세 */}
        {data.materialCostDetails && data.materialCostDetails.length > 0 && (
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <button
              className="btn ghost sm"
              onClick={() => setShowMaterial(!showMaterial)}
            >
              {showMaterial ? "▲ 재료비 상세 접기" : "▼ 재료비 상세내역 보기"}
            </button>
            {showMaterial && (
              <div style={{ overflowX: "auto", marginTop: 8 }}>
                <table>
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th style={{ textAlign: "right" }}>금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.materialCostDetails.map(({ date, amount }) => (
                      <tr key={date}>
                        <td>{date}</td>
                        <td style={{ textAlign: "right" }}>{won(amount)}</td>
                      </tr>
                    ))}
                    <tr className="total">
                      <td>합계</td>
                      <td style={{ textAlign: "right" }}>
                        {won(data.materialCostDetails.reduce((s, r) => s + r.amount, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="pnl-line result mt">
          <span className="name">최종 순수익</span>
          <span className={`amt ${o.netProfit < 0 ? "red" : ""}`}>{won(o.netProfit)}</span>
        </div>
        <p className="muted small mt-s">
          순수익 = 매출 − 급여 − 인센티브 − 고정비 − 부가세 − 카드수수료 − 재료비/주류비 − 마케팅및기타
        </p>
      </div>

      {/* Employee Table */}
      <div className="card mt">
        <h2>직원 현황 <span className="sub">{month}</span></h2>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>직원</th>
                <th>출근</th>
                <th>근무시간</th>
                <th>기여율</th>
                <th>급여 (세전)</th>
                <th>인센티브</th>
                <th>합계 (세전)</th>
              </tr>
            </thead>
            <tbody>
              {data.employees.map((e) => (
                <tr key={e.id}>
                  <td>
                    {e.name}
                    <div className="muted small">{e.position}</div>
                  </td>
                  <td>{e.attendanceDays}일</td>
                  <td>{e.hoursWorked}h</td>
                  <td>{pct(e.contributionRate)}</td>
                  <td>{won(e.baseSalary)}</td>
                  <td>{won(e.incentive)}</td>
                  <td>{won(e.grossPay)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>합계</td>
                <td></td>
                <td></td>
                <td></td>
                <td>{won(o.totalPayroll)}</td>
                <td>{won(o.totalIncentive)}</td>
                <td>{won(o.totalPayroll + o.totalIncentive)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <p className="muted small" style={{ textAlign: "center", marginTop: 32 }}>
        STAY IN BAR · 임원 전용 · 이 페이지의 내용은 외부 공유 금지
      </p>
    </>
  );
}
