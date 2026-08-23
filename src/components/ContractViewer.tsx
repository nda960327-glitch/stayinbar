"use client";

import { useEffect, useState } from "react";
import { won } from "@/lib/format";
import type { EmployeeReport, EmploymentContract } from "@/lib/types";
import SignaturePad from "@/components/SignaturePad";

type Party = "owner" | "employee";

// 서명란 한 칸: 손글씨 서명이 있으면 이미지, 없으면 빈 줄
function SignLine({ signature, signed, signedAt }: { signature?: string; signed?: boolean; signedAt?: string }) {
  if (signature) {
    return (
      <div style={{ marginTop: 8 }}>
        <span style={{ color: "#555" }}>서 &nbsp; &nbsp; 명: </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={signature} alt="서명" style={{ height: 56, verticalAlign: "middle", background: "#fff" }} />
        {signedAt && <span style={{ fontSize: "0.75rem", color: "#777", marginLeft: 8 }}>({signedAt} 전자서명)</span>}
      </div>
    );
  }
  return (
    <p style={{ marginTop: 8, color: "#999" }}>
      서 &nbsp; &nbsp; 명: _____________________(인)
    </p>
  );
}

interface Props {
  emp: EmployeeReport;
  businessName: string;
  isOwner?: boolean;
  incentiveClause?: string; // 【인센티브】 조항 문구 (서버에서 설정값으로 생성)
}

function Blank({ v }: { v?: string | number | null }) {
  if (v === undefined || v === null || v === "" || v === 0) {
    return (
      <span style={{ display: "inline-block", minWidth: 100, borderBottom: "1px solid #999" }}>
        &nbsp;
      </span>
    );
  }
  return <strong>{v}</strong>;
}

export default function ContractViewer({ emp, businessName, isOwner, incentiveClause }: Props) {
  // 서명하면 새로고침 없이 바로 반영되도록 계약 내용을 상태로 들고 있습니다
  const [contract, setContract] = useState<Partial<EmploymentContract>>(emp.contract ?? {});
  useEffect(() => { setContract(emp.contract ?? {}); }, [emp.id, emp.contract]);
  const c = contract;

  const [signing, setSigning] = useState<Party | null>(null);
  const [saving, setSaving] = useState(false);
  const [signMsg, setSignMsg] = useState("");
  const [agreed, setAgreed] = useState(false);

  async function submitSign(party: Party, signature?: string, action: "sign" | "clear" = "sign", useStored = false) {
    setSaving(true);
    setSignMsg("");
    try {
      const res = await fetch("/api/contract/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: emp.id, party, signature, action, useStored }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSignMsg("❌ " + (json.error ?? "서명 저장 실패"));
        return;
      }
      setContract(json.contract ?? {});
      setSigning(null);
      setAgreed(false);
      setSignMsg(action === "clear" ? "서명을 지웠습니다. 다시 서명을 받을 수 있습니다." : "✅ 서명이 저장되었습니다.");
    } catch {
      setSignMsg("❌ 네트워크 오류");
    } finally {
      setSaving(false);
    }
  }
  const monthlySalary = emp.employmentType === "salary" ? Math.round(emp.annualSalary / 12) : null;
  const maskedRrn = emp.personal?.rrn
    ? emp.personal.rrn.replace(/^(\d{6})-?(\d)(\d{5,6})$/, "$1-$2******")
    : null;
  const taxModeLabel = (emp.takeHome?.mode === "3.3" ? "3.3% 원천징수" : "4대보험 가입") + " (근로자 본인 선택)";

  function handlePrint() {
    const el = document.getElementById("contract-print-area");
    if (!el) return;
    const w = window.open("", "_blank", "width=820,height=1100");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html lang="ko"><head>
      <meta charset="UTF-8"/>
      <title>근로계약서 - ${emp.name}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Malgun Gothic',sans-serif;font-size:13px;padding:36px;color:#000;line-height:1.8}
        h1{text-align:center;font-size:22px;letter-spacing:10px;margin-bottom:6px}
        .sub{text-align:center;font-size:11px;color:#555;margin-bottom:20px}
        .intro{margin-bottom:18px}
        .sec{margin-bottom:16px;padding-bottom:12px;border-bottom:1px dashed #bbb}
        .sec-t{font-weight:bold;margin-bottom:4px}
        table{width:100%;border-collapse:collapse;margin-top:6px}
        th,td{border:1px solid #999;padding:5px 8px;font-size:12px}
        th{background:#f0f0f0;width:32%;text-align:left;font-weight:normal}
        .signs{display:flex;gap:24px;margin-top:28px}
        .sign-box{flex:1;border:1px solid #aaa;padding:14px;border-radius:4px}
        .sign-box p{margin-bottom:5px}
        .blank{display:inline-block;min-width:100px;border-bottom:1px solid #000}
      </style>
    </head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  const hasContract = c && Object.keys(c).some((k) => (c as any)[k]);

  return (
    <div className="card mt" style={{ background: "var(--bg-2)" }}>
      <div className="row spread" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>📄 근로계약서</h2>
        {hasContract && (
          <button className="btn sm" onClick={handlePrint}>🖨️ 인쇄 / PDF 저장</button>
        )}
      </div>

      {!hasContract ? (
        <div className="notice">
          {isOwner
            ? "아직 근로계약서가 작성되지 않았습니다. 설정 페이지에서 작성해 주세요."
            : "근로계약서가 아직 등록되지 않았습니다. 사장님에게 문의하세요."}
        </div>
      ) : (
        <div
          id="contract-print-area"
          style={{ background: "#fff", color: "#111", padding: "28px 30px", borderRadius: 8, lineHeight: 1.8, fontSize: "0.88rem" }}
        >
          <h1 style={{ textAlign: "center", fontSize: "1.25rem", letterSpacing: 8, marginBottom: 4 }}>근 로 계 약 서</h1>
          <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#666", marginBottom: 20 }}>(표준근로계약서)</p>

          <p style={{ marginBottom: 18 }}>
            <strong>{businessName}</strong>(이하 &quot;갑&quot;이라 함)과{" "}
            <strong>{emp.name}</strong>(이하 &quot;을&quot;이라 함)은 다음과 같이 근로계약을 체결한다.
          </p>

          {/* 제1조 */}
          <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: "1px dashed #ddd" }}>
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>제 1 조 【근로계약기간】</div>
            <p><Blank v={c.startDate} /> 부터{" "}
              {c.endDate ? <strong>{c.endDate}</strong> : "기간의 정함이 없음"} 까지</p>
          </div>

          {/* 제2조 */}
          <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: "1px dashed #ddd" }}>
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>제 2 조 【근무 장소】</div>
            <p><Blank v={c.workLocation} /></p>
          </div>

          {/* 제3조 */}
          <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: "1px dashed #ddd" }}>
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>제 3 조 【업무 내용】</div>
            <p><Blank v={c.jobDescription || emp.position} /></p>
          </div>

          {/* 제4조 */}
          <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: "1px dashed #ddd" }}>
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>제 4 조 【소정근로시간】</div>
            <p>시업 <Blank v={c.workStartTime} /> ~ 종업 <Blank v={c.workEndTime} />
              &nbsp;(휴게: <strong>{c.breakMinutes || 60}분</strong>)</p>
            <p>근무일: <Blank v={c.workDays} /> &nbsp; 주휴일: <Blank v={c.weeklyRestDay} /></p>
          </div>

          {/* 제5조 */}
          <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: "1px dashed #ddd" }}>
            <div style={{ fontWeight: "bold", marginBottom: 8 }}>제 5 조 【임금】</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
              <tbody>
                {emp.employmentType === "hourly" ? (
                  <tr>
                    <th style={{ border: "1px solid #ccc", padding: "4px 8px", background: "#f5f5f5", textAlign: "left", width: "32%" }}>시급</th>
                    <td style={{ border: "1px solid #ccc", padding: "4px 8px" }}>{won(emp.hourlyWage)}원</td>
                  </tr>
                ) : (
                  <>
                    <tr>
                      <th style={{ border: "1px solid #ccc", padding: "4px 8px", background: "#f5f5f5", textAlign: "left", width: "32%" }}>연봉</th>
                      <td style={{ border: "1px solid #ccc", padding: "4px 8px" }}>{won(emp.annualSalary)}원</td>
                    </tr>
                    <tr>
                      <th style={{ border: "1px solid #ccc", padding: "4px 8px", background: "#f5f5f5", textAlign: "left" }}>월 기본급</th>
                      <td style={{ border: "1px solid #ccc", padding: "4px 8px" }}>{won(monthlySalary!)}원</td>
                    </tr>
                  </>
                )}
                <tr>
                  <th style={{ border: "1px solid #ccc", padding: "4px 8px", background: "#f5f5f5", textAlign: "left" }}>지급일</th>
                  <td style={{ border: "1px solid #ccc", padding: "4px 8px" }}>매월 <Blank v={c.paymentDate ? `${c.paymentDate}일` : undefined} /></td>
                </tr>
                <tr>
                  <th style={{ border: "1px solid #ccc", padding: "4px 8px", background: "#f5f5f5", textAlign: "left" }}>지급방법</th>
                  <td style={{ border: "1px solid #ccc", padding: "4px 8px" }}><Blank v={c.paymentMethod || "계좌이체"} /></td>
                </tr>
                <tr>
                  <th style={{ border: "1px solid #ccc", padding: "4px 8px", background: "#f5f5f5", textAlign: "left" }}>세금처리</th>
                  <td style={{ border: "1px solid #ccc", padding: "4px 8px" }}>{taxModeLabel}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 제6조 인센티브 */}
          {incentiveClause && (
            <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: "1px dashed #ddd" }}>
              <div style={{ fontWeight: "bold", marginBottom: 4 }}>제 6 조 【인센티브】</div>
              <p style={{ whiteSpace: "pre-line" }}>{incentiveClause}</p>
            </div>
          )}

          {/* 교부 */}
          <div style={{ marginBottom: 24, paddingBottom: 12, borderBottom: "1px dashed #ddd" }}>
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>제 {incentiveClause ? 7 : 6} 조 【근로계약서 교부】</div>
            <p>&quot;갑&quot;은 근로계약을 체결함과 동시에 본 계약서를 2부 작성하여 &quot;갑&quot;과 &quot;을&quot;이 각각 1부씩 보관한다.</p>
          </div>

          {/* 작성일 */}
          <p style={{ textAlign: "center", marginBottom: 24, fontWeight: "bold" }}>
            <Blank v={c.signedAt} />
          </p>

          {/* 서명란 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ border: "1px solid #ccc", padding: 14, borderRadius: 6 }}>
              <p style={{ fontWeight: "bold", marginBottom: 8 }}>사용자 (갑)</p>
              <p>사 업 장: {businessName}</p>
              <p>주 &nbsp; &nbsp; 소: <Blank v={c.businessAddress} /></p>
              <p>대 표 자: <Blank v={c.ownerName} /></p>
              <SignLine signature={c.ownerSignature} signed={c.ownerSigned} signedAt={c.ownerSignedAt} />
            </div>
            <div style={{ border: "1px solid #ccc", padding: 14, borderRadius: 6 }}>
              <p style={{ fontWeight: "bold", marginBottom: 8 }}>근로자 (을)</p>
              <p>성 &nbsp; &nbsp; 명: {emp.name}</p>
              <p>주민번호: {maskedRrn || "______-_______"}</p>
              <SignLine signature={c.employeeSignature} signed={c.employeeSigned} signedAt={c.employeeSignedAt} />
            </div>
          </div>
        </div>
      )}

      {/* 전자서명 — 인쇄 영역 밖 */}
      {hasContract && (
        <div style={{ marginTop: 14 }}>
          {/* 근로자(을) */}
          {!isOwner && (
            c.employeeSignature ? (
              <p className="small muted">
                내 서명이 들어간 계약서입니다{c.employeeSignedAt ? ` (${c.employeeSignedAt} 서명)` : ""}. 위 인쇄 버튼으로 PDF로 보관하세요.
              </p>
            ) : signing === "employee" ? (
              <div className="notice" style={{ lineHeight: 1.7 }}>
                <strong>위 근로계약 내용에 동의합니까?</strong>
                <label className="row" style={{ gap: 8, marginTop: 8, alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    style={{ width: "auto", marginTop: 4 }}
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                  />
                  <span className="small">
                    네, 계약기간·근무장소·업무·근로시간·임금·휴일 등 위 내용을 모두 읽었고 이에 동의합니다.
                    아래 서명은 본인의 서명이며, 종이 계약서에 하는 서명과 같은 효력을 갖는 데 동의합니다.
                  </span>
                </label>
                {agreed ? (
                  <SignaturePad
                    label="아래 칸에 손가락이나 마우스로 평소 쓰는 서명을 해주세요. 저장하면 위 계약서 '근로자(을)' 서명란에 그대로 들어갑니다."
                    onSave={(sig) => submitSign("employee", sig)}
                    onCancel={() => { setSigning(null); setAgreed(false); }}
                    saving={saving}
                  />
                ) : (
                  <div className="row" style={{ marginTop: 8 }}>
                    <span className="small muted">동의에 체크하면 서명란이 열립니다.</span>
                    <button className="btn ghost sm" type="button" onClick={() => setSigning(null)}>취소</button>
                  </div>
                )}
              </div>
            ) : (
              <button className="btn" type="button" onClick={() => setSigning("employee")}>
                ✍️ 계약 내용 확인하고 서명하기
              </button>
            )
          )}

          {/* 사장(갑) */}
          {isOwner && (
            <div className="row" style={{ gap: 8 }}>
              {c.ownerSignature ? (
                <button className="btn ghost sm" type="button" disabled={saving} onClick={() => submitSign("owner", undefined, "clear")}>
                  갑 서명 지우기
                </button>
              ) : signing === "owner" ? null : (
                <>
                  <button className="btn sm" type="button" disabled={saving} onClick={() => submitSign("owner", undefined, "sign", true)}>
                    ✍️ 등록된 내 서명으로 갑 서명
                  </button>
                  <button className="btn ghost sm" type="button" onClick={() => setSigning("owner")}>
                    직접 그려서 서명
                  </button>
                </>
              )}
              {c.employeeSignature && (
                <button className="btn ghost sm" type="button" disabled={saving} onClick={() => {
                  if (confirm(`${emp.name} 님의 서명을 지우고 다시 받을까요?`)) submitSign("employee", undefined, "clear");
                }}>
                  근로자 서명 지우기 (다시 받기)
                </button>
              )}
              {!c.employeeSignature && (
                <span className="small muted">근로자 서명은 {emp.name} 님이 본인 계정으로 로그인해 "내 리포트 → 근로계약서"에서 동의 후 직접 합니다.</span>
              )}
            </div>
          )}
          {isOwner && signing === "owner" && (
            <SignaturePad
              label={`사용자(갑) 서명 — ${c.ownerName || businessName} 대표`}
              onSave={(sig) => submitSign("owner", sig)}
              onCancel={() => setSigning(null)}
              saving={saving}
            />
          )}
          {signMsg && <p className="small" style={{ marginTop: 8 }}>{signMsg}</p>}
        </div>
      )}
    </div>
  );
}
