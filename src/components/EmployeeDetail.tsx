"use client";

import { useState } from "react";
import { won, pct, maskRrn } from "@/lib/format";
import type { EmployeeReport } from "@/lib/types";

interface AiReport {
  status: "ok" | "insufficient" | "error";
  summary: string;
  strengths: string[];
  improvements: string[];
}

export default function EmployeeDetail({
  emp,
  month,
  isOwner,
}: {
  emp: EmployeeReport;
  month: string;
  isOwner: boolean;
}) {
  const [viewTaxMode, setViewTaxMode] = useState<"3.3" | "4insurance">(emp.takeHome.mode);
  const [ai, setAi] = useState<AiReport | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const [showRrn, setShowRrn] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({ phone: emp.personal.phone, rrn: emp.personal.rrn, bankAccount: emp.personal.bankAccount });
  const [savingInfo, setSavingInfo] = useState(false);

  async function saveInfo() {
    setSavingInfo(true);
    try {
      const res = await fetch("/api/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(infoForm),
      });
      if (res.ok) {
        setEditingInfo(false);
        // Refresh page or assume success
        window.location.reload();
      } else {
        alert("저장에 실패했습니다.");
      }
    } finally {
      setSavingInfo(false);
    }
  }

  async function generate() {
    setAiLoading(true);
    setAiErr("");
    setAi(null);
    try {
      const res = await fetch("/api/ai-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: emp.id, month }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAiErr(json.error ?? "생성 실패");
        return;
      }
      setAi(json);
    } catch {
      setAiErr("네트워크 오류");
    } finally {
      setAiLoading(false);
    }
  }

  const p = emp.personal;
  const viewTakeHome = viewTaxMode === "3.3" ? (emp.takeHome33 || emp.takeHome) : (emp.takeHome4Ins || emp.takeHome);

  return (
    <div className="card mt">
      <h2>
        {emp.name} <span className="sub">{emp.position} · {month}</span>
      </h2>

      {/* 근무/급여 지표 */}
      <div className="grid cols-4">
        <div className="stat">
          <div className="label">출근일수</div>
          <div className="value">{emp.attendanceDays}일</div>
        </div>
        <div className="stat">
          <div className="label">일한 시간</div>
          <div className="value">{emp.hoursWorked}h</div>
        </div>
        <div className="stat">
          <div className="label">이번달 예상 급여</div>
          <div className="value sm accent">{won(emp.baseSalary)}</div>
          <div className="foot">
            {emp.employmentType === "hourly" ? "시급제" : "월급제"}
          </div>
        </div>
        <div className="stat">
          <div className="label">이번달 예상 인센티브</div>
          <div className="value sm accent">{won(emp.incentive)}</div>
          <div className="foot">기여율 {pct(emp.contributionRate)}</div>
        </div>
      </div>

      {/* 실수령액 */}
      <div className="card mt" style={{ background: "var(--bg-2)" }}>
        <div className="row spread" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>실수령액 (추정)</h2>
          <select 
            value={viewTaxMode} 
            onChange={(e) => setViewTaxMode(e.target.value as "3.3" | "4insurance")}
            style={{ width: "auto", padding: "6px 10px" }}
          >
            <option value="3.3">3.3% 원천징수</option>
            <option value="4insurance">4대보험 적용</option>
          </select>
        </div>
        <div className="pnl-line">
          <span className="name">세전 합계 (급여 + 인센티브)</span>
          <span className="amt">{won(emp.grossPay)}</span>
        </div>
        {viewTakeHome.deductions.map((d) => (
          <div className="pnl-line" key={d.label}>
            <span className="name">{d.label}</span>
            <span className="amt minus">- {won(d.amount)}</span>
          </div>
        ))}
        <div className="pnl-line result">
          <span className="name">실수령액</span>
          <span className="amt">{won(viewTakeHome.net)}</span>
        </div>
        <p className="muted small mt-s">
          ※ 소득세는 부양가족 등 개인 조건에 따라 달라지므로 추정치입니다.
        </p>
      </div>

      {/* 개인정보 */}
      <div className="card mt" style={{ background: "var(--bg-2)" }}>
        <h2>개인 정보</h2>
        <div className="grid cols-2">
          <div className="stat">
            <div className="label">이름</div>
            <div className="value sm">{emp.name}</div>
          </div>
          <div className="stat">
            <div className="label">전화번호</div>
            <div className="value sm">{p.phone || "-"}</div>
          </div>
          <div className="stat">
            <div className="label">주민등록번호</div>
            <div className="value sm">
              {showRrn ? p.rrn || "-" : maskRrn(p.rrn)}{" "}
              {p.rrn && (
                <button
                  className="btn ghost sm"
                  style={{ marginLeft: 8 }}
                  onClick={() => setShowRrn((v) => !v)}
                >
                  {showRrn ? "숨기기" : "보기"}
                </button>
              )}
            </div>
          </div>
          <div className="stat">
            <div className="label">입금 계좌</div>
            <div className="value sm">{p.bankAccount || "-"}</div>
          </div>
        </div>
        {isOwner ? (
          <p className="muted small mt-s">개인정보는 설정 페이지에서 수정할 수 있습니다.</p>
        ) : editingInfo ? (
          <div className="mt" style={{ background: "var(--bg-1)", padding: 16, borderRadius: 8 }}>
            <div className="grid cols-1">
              <label className="field">
                <span className="cap">전화번호</span>
                <input value={infoForm.phone} onChange={e => setInfoForm({ ...infoForm, phone: e.target.value })} />
              </label>
              <label className="field">
                <span className="cap">주민등록번호</span>
                <input value={infoForm.rrn} onChange={e => setInfoForm({ ...infoForm, rrn: e.target.value })} />
              </label>
              <label className="field">
                <span className="cap">입금 계좌</span>
                <input value={infoForm.bankAccount} onChange={e => setInfoForm({ ...infoForm, bankAccount: e.target.value })} />
              </label>
            </div>
            <div className="row mt" style={{ gap: 8 }}>
              <button className="btn sm" onClick={saveInfo} disabled={savingInfo}>{savingInfo ? "저장 중..." : "저장"}</button>
              <button className="btn ghost sm" onClick={() => setEditingInfo(false)} disabled={savingInfo}>취소</button>
            </div>
          </div>
        ) : (
          <div className="mt">
            <button className="btn sm ghost" onClick={() => setEditingInfo(true)}>개인정보 수정</button>
          </div>
        )}
      </div>

      {/* AI 리포트 */}
      <div className="card mt" style={{ background: "var(--bg-2)" }}>
        <div className="row spread">
          <h2 style={{ margin: 0 }}>
            AI 세부 리포트 <span className="sub">잘한 점 · 개선할 점</span>
          </h2>
          <button className="btn sm" onClick={generate} disabled={aiLoading}>
            {aiLoading ? <span className="spinner" /> : ai ? "다시 생성" : "생성"}
          </button>
        </div>

        {aiErr && <div className="notice warn mt-s">{aiErr}</div>}

        {ai && ai.status === "insufficient" && (
          <div className="notice warn mt-s">{ai.summary}</div>
        )}

        {ai && ai.status === "ok" && (
          <>
            <div className="ai-block">
              <h4>요약</h4>
              <div>{ai.summary}</div>
            </div>
            <div className="ai-block">
              <h4>잘한 점</h4>
              {ai.strengths.length ? (
                <ul>
                  {ai.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              ) : (
                <span className="muted">-</span>
              )}
            </div>
            <div className="ai-block">
              <h4>개선해야 할 점</h4>
              {ai.improvements.length ? (
                <ul>
                  {ai.improvements.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              ) : (
                <span className="muted">-</span>
              )}
            </div>
          </>
        )}

        {!ai && !aiLoading && !aiErr && (
          <p className="muted small mt-s">
            [생성] 버튼을 누르면 업무일지를 분석해 잘한 점과 개선할 점을 정리합니다. 일지가 부실하면 &quot;제대로 작성되지 않았습니다&quot;로 표시됩니다.
          </p>
        )}
      </div>
    </div>
  );
}
