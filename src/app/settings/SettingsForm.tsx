"use client";

import { useEffect, useState } from "react";
import type { AppConfig, Employee } from "@/lib/types";
import { won } from "@/lib/format";

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
            <span className="cap">월 고정비 (원)</span>
            <input
              type="number"
              value={config.fixedCost}
              onChange={(e) => set("fixedCost", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="cap">1일 목표 매출 (원)</span>
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

      {/* 인센티브 설정 */}
      <div className="card mt">
        <h2>인센티브 풀 설정</h2>
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
                <input value={e.name} onChange={(ev) => setEmp(idx, { name: ev.target.value })} />
              </label>
              <label className="field">
                <span className="cap">직책</span>
                <input value={e.position} onChange={(ev) => setEmp(idx, { position: ev.target.value })} />
              </label>
              <label className="field">
                <span className="cap">역할</span>
                <select value={e.role} onChange={(ev) => setEmp(idx, { role: ev.target.value as Employee["role"] })}>
                  <option value="owner">사장</option>
                  <option value="manager">점장</option>
                  <option value="staff">직원</option>
                  <option value="server">서버</option>
                </select>
              </label>
              <label className="field">
                <span className="cap">고용형태</span>
                <select
                  value={e.employmentType}
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
                    value={e.annualSalary}
                    onChange={(ev) => setEmp(idx, { annualSalary: Number(ev.target.value) })}
                  />
                  <span className="muted small">월 {won(Math.round(e.annualSalary / 12))}</span>
                </label>
              ) : (
                <label className="field">
                  <span className="cap">시급 (원)</span>
                  <input
                    type="number"
                    value={e.hourlyWage}
                    onChange={(ev) => setEmp(idx, { hourlyWage: Number(ev.target.value) })}
                  />
                </label>
              )}
              <label className="field">
                <span className="cap">세금 방식</span>
                <select value={e.taxMode} onChange={(ev) => setEmp(idx, { taxMode: ev.target.value as Employee["taxMode"] })}>
                  <option value="3.3">3.3% 원천징수</option>
                  <option value="4insurance">4대보험</option>
                </select>
              </label>
              <label className="field">
                <span className="cap">근무시간/일</span>
                <input
                  type="number"
                  value={e.hoursPerDay}
                  onChange={(ev) => setEmp(idx, { hoursPerDay: Number(ev.target.value) })}
                />
              </label>
              <label className="field">
                <span className="cap">PIN</span>
                <input value={e.pin} onChange={(ev) => setEmp(idx, { pin: ev.target.value })} />
              </label>
              <label className="field">
                <span className="cap">전화번호</span>
                <input value={e.phone} onChange={(ev) => setEmp(idx, { phone: ev.target.value })} />
              </label>
              <label className="field">
                <span className="cap">주민등록번호</span>
                <input value={e.rrn} onChange={(ev) => setEmp(idx, { rrn: ev.target.value })} />
              </label>
              <label className="field">
                <span className="cap">입금 계좌</span>
                <input value={e.bankAccount} onChange={(ev) => setEmp(idx, { bankAccount: ev.target.value })} />
              </label>
              <label className="field">
                <span className="cap">시트 이름(별칭, 쉼표로 구분)</span>
                <input
                  value={e.aliases.join(", ")}
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
