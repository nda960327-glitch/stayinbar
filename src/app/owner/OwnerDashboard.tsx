"use client";

import { useCallback, useEffect, useState } from "react";
import { won, wonShort, pct } from "@/lib/format";
import type { EmployeeReport, MonthlyResult } from "@/lib/types";
import EmployeeDetail from "@/components/EmployeeDetail";

type OwnerData = MonthlyResult & {
  businessName: string;
  source: string;
  updatedAt: string;
};

export default function OwnerDashboard() {
  const [data, setData] = useState<OwnerData | null>(null);
  const [month, setMonth] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 변동비 입력
  const [marketing, setMarketing] = useState(0);
  const [savingCost, setSavingCost] = useState(false);

  // 업로드
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  const [openEmp, setOpenEmp] = useState<string | null>(null);
  const [showMaterial, setShowMaterial] = useState(false);

  const load = useCallback(async (m?: string) => {
    setLoading(true);
    setError("");
    try {
      const url = m ? `/api/data?month=${m}` : "/api/data";
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "데이터 로드 실패");
        setData(null);
        return;
      }
      setData(json);
      setMonth(json.month);
      setMarketing(json.owner?.marketingCost ?? 0);
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveCosts() {
    setSavingCost(true);
    try {
      const cfgRes = await fetch("/api/config");
      const cfg = await cfgRes.json();
      cfg.variableCosts = cfg.variableCosts ?? {};
      cfg.variableCosts[month] = { ...cfg.variableCosts[month], marketing: Number(marketing) || 0 };
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      await load(month);
    } finally {
      setSavingCost(false);
    }
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setUploadMsg("❌ " + (json.error ?? "업로드 실패"));
        return;
      }
      setUploadMsg(`✅ ${json.count}건 불러옴`);
      await load();
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  if (loading && !data) {
    return <div className="card">불러오는 중…</div>;
  }
  if (error) {
    return (
      <div className="card">
        <div className="notice warn">{error}</div>
        <UploadCard upload={upload} uploading={uploading} uploadMsg={uploadMsg} />
      </div>
    );
  }
  if (!data) return null;

  const o = data.owner ?? ({} as any);
  const availableMonths = data.availableMonths ?? [];
  const hasData = data.workingDays > 0;

  return (
    <>
      {/* 월 선택 + 데이터 소스 */}
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
            {availableMonths.length === 0 && <option value={month}>{month || "데이터 없음"}</option>}
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <span className="muted small">
          소스: {sourceLabel(data.source)}
          {data.updatedAt ? ` · ${new Date(data.updatedAt).toLocaleString("ko-KR")}` : ""}
        </span>
      </div>

      {!hasData && (
        <div className="card">
          <div className="notice warn">
            {month ? `${month} 데이터가 없습니다.` : "업무일지 데이터가 없습니다."} 아래에서 엑셀/CSV를 업로드하거나 설정에서 구글시트 URL을 등록하세요.
          </div>
          <UploadCard upload={upload} uploading={uploading} uploadMsg={uploadMsg} />
        </div>
      )}

      {hasData && (
        <>
          {/* 핵심 지표 */}
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
              <div className="foot">1일 목표 {wonShort(o.workingDays > 0 ? Math.round(o.targetSales / o.workingDays) : 0)}원</div>
            </div>
            <div className="stat">
              <div className="label">최종 순수익</div>
              <div className={`value ${o.netProfit >= 0 ? "green" : "red"}`}>
                {wonShort(o.netProfit)}원
              </div>
              <div className="foot">{won(o.netProfit)}</div>
            </div>
          </div>

          {/* 손익 계산서 */}
          <div className="card mt">
            <h2>
              손익 계산 <span className="sub">{month}</span>
            </h2>
            <div className="pnl-line">
              <span className="name">월 총매출</span>
              <span className="amt">{won(o.totalSales)}</span>
            </div>
            <div className="pnl-line">
              <span className="name">
                총 급여 <span className="hint">전 직원 세전 급여</span>
              </span>
              <span className="amt minus">- {won(o.totalPayroll)}</span>
            </div>
            <div className="pnl-line">
              <span className="name">
                총 인센티브 <span className="hint">3% + 2% 풀</span>
              </span>
              <span className="amt minus">- {won(o.totalIncentive)}</span>
            </div>
            <div className="pnl-line">
              <span className="name">
                고정비 <span className="hint">월세 등</span>
              </span>
              <span className="amt minus">- {won(o.fixedCost)}</span>
            </div>
            <div className="pnl-line">
              <span className="name">부가세 (매출의 10%)</span>
              <span className="amt minus">- {won(o.vat)}</span>
            </div>
            <div className="pnl-line">
              <span className="name">카드수수료 (매출의 2%)</span>
              <span className="amt minus">- {won(o.cardFee)}</span>
            </div>

            <div className="pnl-line">
              <span className="name">
                재료비 + 주류비 <span className="hint">시트 자동 합산</span>
              </span>
              <span className="amt minus">- {won(o.materialCost)}</span>
            </div>
            {data.materialCostDetails && data.materialCostDetails.length > 0 && (
              <div style={{ marginBottom: 8 }}>
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

            {/* 입력 변동비 */}
            <div className="grid cols-1 mt">
              <label className="field">
                <span className="cap">마케팅 및 기타 (입력)</span>
                <input
                  type="number"
                  value={marketing}
                  onChange={(e) => setMarketing(Number(e.target.value))}
                />
              </label>
            </div>
            <button className="btn sm" onClick={saveCosts} disabled={savingCost}>
              {savingCost ? "저장 중…" : "변동비 저장"}
            </button>

            <div className="pnl-line result mt">
              <span className="name">최종 순수익</span>
              <span className={`amt ${o.netProfit < 0 ? "red" : ""}`}>{won(o.netProfit)}</span>
            </div>
            <p className="muted small mt-s">
              순수익 = 매출 − 급여 − 인센티브 − 고정비 − 부가세 − 카드수수료 − 재료비/주류비 − 마케팅및기타
            </p>
          </div>

          {/* 직원 요약 테이블 */}
          <div className="card mt">
            <div className="row spread">
              <h2 style={{ margin: 0 }}>직원별 급여 · 인센티브</h2>
              <a href="/settings" className="btn ghost sm">
                ⚙️ 직원 추가 / 이름 수정
              </a>
            </div>
            <div style={{ overflowX: "auto", marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>직원</th>
                    <th>출근</th>
                    <th>시간</th>
                    <th>기여율</th>
                    <th>급여</th>
                    <th>인센티브</th>
                    <th>세전 합계</th>
                    <th>실수령(추정)</th>
                    <th></th>
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
                      <td>{won(e.takeHome.net)}</td>
                      <td>
                        <button
                          className="btn ghost sm"
                          onClick={() => setOpenEmp(openEmp === e.id ? null : e.id)}
                        >
                          {openEmp === e.id ? "닫기" : "상세"}
                        </button>
                      </td>
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
                    <td></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
            {data.unmatchedNames.length > 0 && (
              <div className="notice mt">
                미등록 이름: {data.unmatchedNames.join(", ")} — 설정에서 직원으로 등록하면 집계됩니다.
              </div>
            )}
          </div>

          {/* 직원 상세 + AI 리포트 */}
          {data.employees
            .filter((e) => e.id === openEmp)
            .map((e) => (
              <EmployeeDetail key={e.id} emp={e} month={month} isOwner />
            ))}

          {/* 데이터 업로드 */}
          <UploadCard upload={upload} uploading={uploading} uploadMsg={uploadMsg} />
        </>
      )}
    </>
  );
}

function sourceLabel(source: string): string {
  if (source === "google-sheet") return "구글시트";
  if (source.startsWith("upload:")) return "업로드 " + source.slice(7);
  return "없음";
}

function UploadCard({
  upload,
  uploading,
  uploadMsg,
}: {
  upload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploading: boolean;
  uploadMsg: string;
}) {
  return (
    <div className="card mt">
      <h2>
        업무일지 데이터 업로드 <span className="sub">.xlsx / .csv</span>
      </h2>
      <p className="muted small">
        구글폼 응답 시트를 엑셀 또는 CSV로 내려받아 업로드하세요. 설정에서 구글시트 공개 CSV URL을 등록하면 자동으로 최신 데이터를 불러옵니다.
      </p>
      <div className="row mt-s">
        <label className="btn sm" style={{ cursor: "pointer" }}>
          {uploading ? "업로드 중…" : "파일 선택"}
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={upload}
            style={{ display: "none" }}
            disabled={uploading}
          />
        </label>
        {uploadMsg && <span className="small">{uploadMsg}</span>}
      </div>
    </div>
  );
}
