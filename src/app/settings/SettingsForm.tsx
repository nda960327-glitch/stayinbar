"use client";

import { useEffect, useState } from "react";
import type { AppConfig, Employee, Notice } from "@/lib/types";
import { won } from "@/lib/format";
import SignaturePad from "@/components/SignaturePad";

function emptyEmployee(): Employee {
  return {
    id: "emp-" + Math.floor(Math.random() * 1e9).toString(36),
    name: "",
    aliases: [],
    role: "staff",
    position: "",
    employmentType: "salary",
    annualSalary: 0,
    hourlyWage: 0,
    taxMode: "3.3",
    hoursPerDay: 9,
    getsPool3: false,
    phone: "",
    rrn: "",
    bankAccount: "",
    pin: "0000",
  };
}

export default function SettingsForm() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [openContract, setOpenContract] = useState<string | null>(null);
  const [drawOwnerSig, setDrawOwnerSig] = useState(false);

  // 사업주 서명 이미지 업로드 → 가로 600px 이하 PNG data URL로 줄여서 저장
  function onOwnerSigFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 600;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        set("ownerSignature", canvas.toDataURL("image/png"));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig);
  }, []);

  if (!config) return <div className="card">불러오는 중…</div>;

  function set<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    setConfig((c) => (c ? { ...c, [key]: value } : c));
  }

  function setEmp(idx: number, patch: Partial<Employee>) {
    setConfig((c) => {
      if (!c) return c;
      const employees = c.employees.map((e, i) => (i === idx ? { ...e, ...patch } : e));
      return { ...c, employees };
    });
  }

  function setNotice(idx: number, patch: Partial<Notice>) {
    setConfig((c) => {
      if (!c) return c;
      const notices = (c.notices ?? []).map((n, i) => (i === idx ? { ...n, ...patch } : n));
      return { ...c, notices };
    });
  }

  function addNotice() {
    const today = new Date().toISOString().slice(0, 10);
    const n: Notice = { id: "notice-" + Date.now().toString(36), date: today, title: "", body: "", pinned: false };
    setConfig((c) => (c ? { ...c, notices: [n, ...(c.notices ?? [])] } : c));
  }

  function removeNotice(idx: number) {
    setConfig((c) => (c ? { ...c, notices: (c.notices ?? []).filter((_, i) => i !== idx) } : c));
  }

  function addEmp() {
    setConfig((c) => (c ? { ...c, employees: [...c.employees, emptyEmployee()] } : c));
  }

  function removeEmp(idx: number) {
    setConfig((c) =>
      c ? { ...c, employees: c.employees.filter((_, i) => i !== idx) } : c
    );
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setMsg(res.ok ? "✅ 저장되었습니다." : "❌ 저장 실패");
    } catch {
      setMsg("❌ 네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="row spread" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>설정</h2>
        <div className="row">
          {msg && <span className="small">{msg}</span>}
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? "저장 중…" : "전체 저장"}
          </button>
        </div>
      </div>

      {/* 매장 기본 설정 */}
      <div className="card">
        <h2>매장 · 비용 설정</h2>
        <div className="grid cols-2">
          <label className="field">
            <span className="cap">매장 이름</span>
            <input value={config.businessName} onChange={(e) => set("businessName", e.target.value)} />
          </label>
          <label className="field">
            <span className="cap">사업장 주소 (근로계약서 근무장소 기본값)</span>
            <input value={config.businessAddress ?? ""} onChange={(e) => set("businessAddress", e.target.value)} placeholder="예: 서울시 강남구 언주로98길 14, B1" />
          </label>
          <label className="field">
            <span className="cap">사업주 성명 (근로계약서 대표자 기본값)</span>
            <input value={config.ownerName ?? ""} onChange={(e) => set("ownerName", e.target.value)} placeholder="예: 노도아" />
          </label>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span className="cap">근로계약서 담당 업무 기본 문구</span>
            <input value={config.defaultJobDescription ?? ""} onChange={(e) => set("defaultJobDescription", e.target.value)} placeholder="예: 바 운영 전반 업무 일체" />
          </label>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span className="cap">근로계약서 【인센티브】 조항 — 비워두면 아래 인센티브 설정값(순이익 비율·적용 시작 월)으로 자동 작성됩니다</span>
            <textarea
              rows={5}
              value={config.contractIncentiveClause ?? ""}
              onChange={(e) => set("contractIncentiveClause", e.target.value)}
              placeholder={`(자동) ① "갑"은 "을"에게 기본급 외에 인센티브를 지급한다. ② ${config.incentiveProfitStartMonth || "YYYY-MM"}부터 매월 인센티브 차감 전 순이익의 ${Math.round((config.incentiveProfitRate ?? 0) * 100)}%를 인센티브 풀(총액)로 편성한다. ③ 풀 총액을 기여율대로 나눠 지급한다(각자 10%가 아님). ④ 순이익 0 이하인 달은 없음. ⑤ …`}
            />
          </label>
        </div>

        {/* 사업주 서명 */}
        <div style={{ marginTop: 14, padding: 14, background: "var(--bg-1)", borderRadius: 8 }}>
          <div className="row spread">
            <strong>✍️ 사업주 서명 (근로계약서 &quot;갑&quot; 서명에 사용)</strong>
            {config.ownerSignature && (
              <button className="btn ghost sm" type="button" onClick={() => set("ownerSignature", "")}>서명 삭제</button>
            )}
          </div>
          <p className="muted small" style={{ marginTop: 4 }}>
            한 번 등록해 두면 각 직원 계약서에서 &quot;등록된 내 서명으로 갑 서명&quot; 버튼 한 번으로 서명됩니다. 서명 이미지 파일(캡처 PNG/JPG)을 올리거나 아래에서 직접 그리세요. 등록 후 맨 아래 <strong>전체 저장</strong>.
          </p>
          {config.ownerSignature ? (
            <div style={{ marginTop: 8, background: "#fff", display: "inline-block", padding: 6, borderRadius: 6 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={config.ownerSignature} alt="사업주 서명" style={{ height: 70, display: "block" }} />
            </div>
          ) : (
            <p className="small" style={{ marginTop: 8, color: "var(--warn, #d97a5c)" }}>아직 등록된 서명이 없습니다.</p>
          )}
          <div className="row" style={{ marginTop: 10, gap: 10 }}>
            <label className="btn ghost sm" style={{ cursor: "pointer" }}>
              📎 서명 이미지 올리기
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onOwnerSigFile(e.target.files?.[0])} />
            </label>
            <button className="btn ghost sm" type="button" onClick={() => setDrawOwnerSig((v) => !v)}>
              {drawOwnerSig ? "그리기 닫기" : "✍️ 직접 그리기"}
            </button>
          </div>
          {drawOwnerSig && (
            <SignaturePad
              label="평소 쓰는 서명을 그린 뒤 '이 서명으로 서명하기'를 누르면 위에 등록됩니다."
              onSave={(sig) => { set("ownerSignature", sig); setDrawOwnerSig(false); }}
              onCancel={() => setDrawOwnerSig(false)}
            />
          )}
        </div>
        <div className="grid cols-2" style={{ marginTop: 14 }}>
          <label className="field">
            <span className="cap">월 고정비 (원)</span>
            <input
              type="number"
              value={config.fixedCost}
              onChange={(e) => set("fixedCost", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="cap">월 목표 매출 (원) — 비우면 1일 목표 × 영업일수</span>
            <input
              type="number"
              value={config.monthlyTarget ?? 0}
              onChange={(e) => set("monthlyTarget", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="cap">1일 목표 매출 (원) — 월 목표가 없을 때만 사용</span>
            <input
              type="number"
              value={config.dailyTarget}
              onChange={(e) => set("dailyTarget", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="cap">부가세율 (예: 0.1 = 10%)</span>
            <input
              type="number"
              step="0.01"
              value={config.vatRate}
              onChange={(e) => set("vatRate", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="cap">기본 근무시간/일 (시간)</span>
            <input
              type="number"
              value={config.defaultHoursPerDay}
              onChange={(e) => set("defaultHoursPerDay", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="cap">사장 PIN</span>
            <input value={config.ownerPin} onChange={(e) => set("ownerPin", e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span className="cap">구글시트 공개 CSV URL (선택)</span>
          <input
            value={config.sheetCsvUrl}
            onChange={(e) => set("sheetCsvUrl", e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…/export?format=csv&gid=…"
          />
        </label>
        <p className="muted small">
          시트를 &quot;링크가 있는 모든 사용자에게 공개&quot;로 설정한 뒤 위 URL을 넣으면 최신 데이터를 자동으로 불러옵니다. 비워두면 업로드한 파일을 사용합니다.
        </p>
      </div>

      {/* 임원 대시보드 PIN */}
      <div className="card mt">
        <h2>임원 대시보드 PIN</h2>
        <label className="field" style={{ maxWidth: 280 }}>
          <span className="cap">/exec 입장 PIN</span>
          <input
            value={config.execPin ?? ""}
            onChange={(e) => set("execPin", e.target.value.trim())}
            placeholder="숫자 PIN"
            inputMode="numeric"
          />
        </label>
        <p className="muted small">임원 대시보드(/exec)에 들어갈 때 쓰는 PIN입니다. 바꾼 뒤 맨 아래 <strong>전체 저장</strong>을 누르세요.</p>
      </div>

      {/* 공지사항 */}
      <div className="card mt">
        <div className="row spread">
          <h2 style={{ margin: 0 }}>📢 공지사항</h2>
          <button className="btn ghost sm" onClick={addNotice} type="button">
            + 공지 추가
          </button>
        </div>
        <p className="muted small mt-s">
          직원 페이지 · 대시보드 · 임원 대시보드 상단에 표시됩니다. 내용을 고친 뒤 맨 아래 <strong>전체 저장</strong>을 누르세요.
        </p>
        {(config.notices ?? []).length === 0 && (
          <p className="muted small">등록된 공지가 없습니다.</p>
        )}
        {(config.notices ?? []).map((n, idx) => (
          <div key={n.id} style={{ marginTop: 12, padding: 14, background: "var(--bg-1)", borderRadius: 8 }}>
            <div className="grid cols-3">
              <label className="field" style={{ gridColumn: "span 2" }}>
                <span className="cap">제목</span>
                <input value={n.title} onChange={(e) => setNotice(idx, { title: e.target.value })} placeholder="예: 9월부터 인센티브 제도가 바뀝니다" />
              </label>
              <label className="field">
                <span className="cap">게시일</span>
                <input type="date" value={n.date} onChange={(e) => setNotice(idx, { date: e.target.value })} />
              </label>
            </div>
            <label className="field" style={{ marginTop: 8 }}>
              <span className="cap">내용</span>
              <textarea rows={6} value={n.body} onChange={(e) => setNotice(idx, { body: e.target.value })} placeholder="공지 내용 (줄바꿈 그대로 표시됩니다)" />
            </label>
            <div className="row spread" style={{ marginTop: 8 }}>
              <label className="row small">
                <input type="checkbox" checked={!!n.pinned} onChange={(e) => setNotice(idx, { pinned: e.target.checked })} style={{ width: "auto" }} />
                맨 위에 고정
              </label>
              <button className="btn ghost sm" onClick={() => removeNotice(idx)} type="button">삭제</button>
            </div>
          </div>
        ))}
      </div>

      {/* 인센티브 설정 */}
      <div className="card mt">
        <h2>인센티브 설정</h2>
        <div className="grid cols-2">
          <label className="field">
            <span className="cap">순이익 인센티브 비율 (예: 0.1 = 10%)</span>
            <input
              type="number"
              step="0.01"
              value={config.incentiveProfitRate ?? 0}
              onChange={(e) => set("incentiveProfitRate", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="cap">순이익 인센티브 적용 시작 월 (YYYY-MM)</span>
            <input
              type="month"
              value={config.incentiveProfitStartMonth ?? ""}
              onChange={(e) => set("incentiveProfitStartMonth", e.target.value)}
            />
          </label>
        </div>
        <p className="muted small">
          적용 시작 월부터는 <strong>인센티브 차감 전 순이익 × 비율</strong>을 인센티브 풀(총액) 하나로 잡고, 그 풀을 각자 기여율(본인 기여점수 ÷ 전체 점수)대로 나눠 지급합니다 — 각자가 순이익의 10%를 받는 게 아닙니다
          (순이익이 0 이하인 달은 인센티브 없음). 그 전 달은 아래 매출 풀 방식으로 계산됩니다.
        </p>
        <h2 style={{ marginTop: 16 }}>매출 풀 방식 <span className="sub">적용 시작 월 이전 달에만 사용</span></h2>
        <div className="grid cols-2">
          <label className="field">
            <span className="cap">3% 풀 비율 (점장 단독)</span>
            <input
              type="number"
              step="0.005"
              value={config.incentivePool3Rate}
              onChange={(e) => set("incentivePool3Rate", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="cap">2% 풀 비율 (점수 비례 분배)</span>
            <input
              type="number"
              step="0.005"
              value={config.incentivePool2Rate}
              onChange={(e) => set("incentivePool2Rate", Number(e.target.value))}
            />
          </label>
        </div>
        <p className="muted small">
          3% 풀은 아래 직원 중 &quot;3% 풀 대상&quot;에 체크된 사람에게 균등 지급되고, 2% 풀은 전 직원 기여점수에 비례해 분배됩니다.
        </p>
      </div>

      {/* 직원 관리 */}
      <div className="card mt">
        <div className="row spread">
          <h2 style={{ margin: 0 }}>직원 관리</h2>
          <button className="btn ghost sm" onClick={addEmp}>
            + 직원 추가
          </button>
        </div>

        {config.employees.map((e, idx) => (
          <div key={e.id} className="card mt" style={{ background: "var(--bg-2)" }}>
            <div className="row spread">
              <strong>{e.name || "(이름 없음)"}</strong>
              <button className="btn ghost sm" onClick={() => removeEmp(idx)}>
                삭제
              </button>
            </div>
            <div className="grid cols-3 mt-s">
              <label className="field">
                <span className="cap">이름</span>
                <input value={e.name ?? ""} onChange={(ev) => setEmp(idx, { name: ev.target.value })} />
              </label>
              <label className="field">
                <span className="cap">직책</span>
                <input value={e.position ?? ""} onChange={(ev) => setEmp(idx, { position: ev.target.value })} />
              </label>
              <label className="field">
                <span className="cap">역할</span>
                <select value={e.role ?? "staff"} onChange={(ev) => setEmp(idx, { role: ev.target.value as Employee["role"] })}>
                  <option value="owner">사장</option>
                  <option value="manager">점장</option>
                  <option value="staff">직원</option>
                  <option value="server">서버</option>
                </select>
              </label>
              <label className="field">
                <span className="cap">고용형태</span>
                <select
                  value={e.employmentType ?? "salary"}
                  onChange={(ev) => setEmp(idx, { employmentType: ev.target.value as Employee["employmentType"] })}
                >
                  <option value="salary">월급/연봉제</option>
                  <option value="hourly">시급제</option>
                </select>
              </label>
              {e.employmentType === "salary" ? (
                <label className="field">
                  <span className="cap">연봉 (원)</span>
                  <input
                    type="number"
                    value={e.annualSalary ?? 0}
                    onChange={(ev) => setEmp(idx, { annualSalary: Number(ev.target.value) })}
                  />
                  <span className="muted small">월 {won(Math.round((e.annualSalary ?? 0) / 12))}</span>
                </label>
              ) : (
                <label className="field">
                  <span className="cap">시급 (원)</span>
                  <input
                    type="number"
                    value={e.hourlyWage ?? 0}
                    onChange={(ev) => setEmp(idx, { hourlyWage: Number(ev.target.value) })}
                  />
                </label>
              )}
              <label className="field">
                <span className="cap">세금 방식</span>
                <select value={e.taxMode ?? "3.3"} onChange={(ev) => setEmp(idx, { taxMode: ev.target.value as Employee["taxMode"] })}>
                  <option value="3.3">3.3% 원천징수</option>
                  <option value="4insurance">4대보험</option>
                </select>
              </label>
              <label className="field">
                <span className="cap">근무시간/일</span>
                <input
                  type="number"
                  value={e.hoursPerDay ?? 9}
                  onChange={(ev) => setEmp(idx, { hoursPerDay: Number(ev.target.value) })}
                />
              </label>
              <label className="field">
                <span className="cap">PIN</span>
                <input value={e.pin ?? ""} onChange={(ev) => setEmp(idx, { pin: ev.target.value })} />
              </label>
              <label className="field">
                <span className="cap">전화번호</span>
                <input value={e.phone ?? ""} onChange={(ev) => setEmp(idx, { phone: ev.target.value })} />
              </label>
              <label className="field">
                <span className="cap">주민등록번호</span>
                <input value={e.rrn ?? ""} onChange={(ev) => setEmp(idx, { rrn: ev.target.value })} />
              </label>
              <label className="field">
                <span className="cap">입금 계좌</span>
                <input value={e.bankAccount ?? ""} onChange={(ev) => setEmp(idx, { bankAccount: ev.target.value })} />
              </label>
              <label className="field">
                <span className="cap">시트 이름(별칭, 쉼표로 구분)</span>
                <input
                  value={(e.aliases || []).join(", ")}
                  onChange={(ev) =>
                    setEmp(idx, {
                      aliases: ev.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  placeholder="Joon Manager, 준식"
                />
              </label>

            </div>
            <label className="row" style={{ gap: 8 }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={e.getsPool3}
                onChange={(ev) => setEmp(idx, { getsPool3: ev.target.checked })}
              />
              <span className="small">3% 인센티브 풀 대상 (점장)</span>
            </label>

            {/* 근로계약서 */}
            <div style={{ marginTop: 12 }}>
              <button
                className="btn ghost sm"
                onClick={() => {
                  const opening = openContract !== e.id;
                  if (opening) {
                    // 비어 있는 근무장소·사업장 주소·사업주 성명은 매장 설정값으로 채워 넣는다
                    const c = e.contract ?? {};
                    const patch: Partial<typeof c> = {};
                    if (!c.workLocation && config?.businessAddress) patch.workLocation = config.businessAddress;
                    if (!c.businessAddress && config?.businessAddress) patch.businessAddress = config.businessAddress;
                    if (!c.ownerName && config?.ownerName) patch.ownerName = config.ownerName;
                    if (!c.jobDescription && config?.defaultJobDescription) patch.jobDescription = config.defaultJobDescription;
                    if (!c.paymentMethod) patch.paymentMethod = "계좌이체";
                    if (!c.breakMinutes) patch.breakMinutes = 60;
                    if (Object.keys(patch).length) setEmp(idx, { contract: { ...c, ...patch } });
                  }
                  setOpenContract(opening ? e.id : null);
                }}
                type="button"
              >
                {openContract === e.id ? "▲ 근로계약서 접기" : "📄 근로계약서 작성"}
              </button>
            </div>

            {openContract === e.id && (
              <div style={{ marginTop: 12, padding: 16, background: "var(--bg-1)", borderRadius: 8 }}>
                <p className="muted small" style={{ marginBottom: 12 }}>
                  아래 내용을 입력 후 위의 <strong>전체 저장</strong> 버튼을 누르세요.
                </p>
                <div className="grid cols-3">
                  <label className="field">
                    <span className="cap">계약 시작일</span>
                    <input type="date" value={e.contract?.startDate ?? ""} onChange={(ev) => setEmp(idx, { contract: { ...e.contract, startDate: ev.target.value } })} />
                  </label>
                  <label className="field">
                    <span className="cap">계약 종료일 (비우면 무기한)</span>
                    <input type="date" value={e.contract?.endDate ?? ""} onChange={(ev) => setEmp(idx, { contract: { ...e.contract, endDate: ev.target.value } })} />
                  </label>
                  <label className="field">
                    <span className="cap">계약서 작성일</span>
                    <input type="date" value={e.contract?.signedAt ?? ""} onChange={(ev) => setEmp(idx, { contract: { ...e.contract, signedAt: ev.target.value } })} />
                  </label>
                  <label className="field">
                    <span className="cap">근무 장소</span>
                    <input value={e.contract?.workLocation ?? ""} onChange={(ev) => setEmp(idx, { contract: { ...e.contract, workLocation: ev.target.value } })} placeholder={config.businessAddress || "예: 서울시 강남구 언주로98길 14, B1"} />
                  </label>
                  <label className="field">
                    <span className="cap">사업장 주소</span>
                    <input value={e.contract?.businessAddress ?? ""} onChange={(ev) => setEmp(idx, { contract: { ...e.contract, businessAddress: ev.target.value } })} />
                  </label>
                  <label className="field">
                    <span className="cap">담당 업무</span>
                    <input value={e.contract?.jobDescription ?? ""} onChange={(ev) => setEmp(idx, { contract: { ...e.contract, jobDescription: ev.target.value } })} placeholder={e.position || "바텐더 업무"} />
                  </label>
                  <label className="field">
                    <span className="cap">시업 시각</span>
                    <input type="time" value={e.contract?.workStartTime ?? ""} onChange={(ev) => setEmp(idx, { contract: { ...e.contract, workStartTime: ev.target.value } })} />
                  </label>
                  <label className="field">
                    <span className="cap">종업 시각</span>
                    <input type="time" value={e.contract?.workEndTime ?? ""} onChange={(ev) => setEmp(idx, { contract: { ...e.contract, workEndTime: ev.target.value } })} />
                  </label>
                  <label className="field">
                    <span className="cap">휴게 시간 (분)</span>
                    <input type="number" value={e.contract?.breakMinutes ?? 60} onChange={(ev) => setEmp(idx, { contract: { ...e.contract, breakMinutes: Number(ev.target.value) } })} />
                  </label>
                  <label className="field">
                    <span className="cap">근무 요일</span>
                    <input value={e.contract?.workDays ?? ""} onChange={(ev) => setEmp(idx, { contract: { ...e.contract, workDays: ev.target.value } })} placeholder="예: 월~일" />
                  </label>
                  <label className="field">
                    <span className="cap">주휴일</span>
                    <input value={e.contract?.weeklyRestDay ?? ""} onChange={(ev) => setEmp(idx, { contract: { ...e.contract, weeklyRestDay: ev.target.value } })} placeholder="예: 일요일" />
                  </label>
                  <label className="field">
                    <span className="cap">임금 지급일 (매월 N일)</span>
                    <input type="number" value={e.contract?.paymentDate ?? 25} onChange={(ev) => setEmp(idx, { contract: { ...e.contract, paymentDate: Number(ev.target.value) } })} />
                  </label>
                  <label className="field">
                    <span className="cap">지급 방법</span>
                    <input value={e.contract?.paymentMethod ?? ""} onChange={(ev) => setEmp(idx, { contract: { ...e.contract, paymentMethod: ev.target.value } })} placeholder="예: 계좌이체" />
                  </label>
                  <label className="field">
                    <span className="cap">사업주 성명</span>
                    <input value={e.contract?.ownerName ?? ""} onChange={(ev) => setEmp(idx, { contract: { ...e.contract, ownerName: ev.target.value } })} />
                  </label>
                </div>
                <p className="muted small mt">
                  서명 상태 — 갑(사업주): {e.contract?.ownerSignature ? `서명됨 (${e.contract.ownerSignedAt ?? ""})` : "미서명"} · 을(근로자): {e.contract?.employeeSignature ? `서명됨 (${e.contract.employeeSignedAt ?? ""})` : "미서명"}
                  <br />서명은 체크가 아니라 실제 서명으로만 됩니다: 갑은 대시보드 → 직원 상세 → 계약서에서, 을은 직원 본인이 로그인해 동의 후 서명합니다.
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? "저장 중…" : "전체 저장"}
        </button>
      </div>
      <p className="muted small mt">
        ※ 시트 이름(별칭)은 구글폼에서 제출한 &quot;수행자 이름&quot;과 매칭됩니다. 예: 폼에 &quot;Joon Manager (메인바텐더,점장님)&quot;로 적었다면 별칭에 &quot;Joon Manager&quot;를 넣으세요.
      </p>
    </>
  );
}
