"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Customer } from "@/lib/customers";

type Tab = "add" | "list" | "bday" | "away" | "data";
type SortKey = "recent" | "stamp" | "name";

const EMPTY_FORM = {
  name: "",
  tel: "",
  co: "",
  bm: "",
  bd: "",
  stamp: "1",
  visit: "",
  memo: "",
  c1: true,
  c2: true,
  c3: false,
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysSince(d: string): number {
  if (!d) return 9999;
  return Math.floor((+new Date(today()) - +new Date(d)) / 864e5);
}

function fmtTel(t: string): string {
  const n = String(t || "").replace(/\D/g, "");
  return n.length === 11 ? `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7)}` : t || "";
}

function download(name: string, text: string, csv: boolean) {
  const blob = new Blob([csv ? "﻿" + text : text], {
    type: (csv ? "text/csv" : "application/json") + ";charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function CustomersClient({
  role,
  userName,
}: {
  role: string;
  userName: string;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("add");
  const [form, setForm] = useState({ ...EMPTY_FORM, visit: "" });
  const [editing, setEditing] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const isOwner = role === "owner";

  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2000);
  }

  async function load() {
    try {
      const res = await fetch("/api/customers");
      if (res.ok) setCustomers(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setForm((f) => ({ ...f, visit: today() }));
    load();
  }, []);

  function resetForm() {
    setForm({ ...EMPTY_FORM, visit: today() });
    setEditing(null);
  }

  async function upsert(record: Customer, msg: string) {
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      showToast(err?.error || "저장에 실패했습니다");
      return false;
    }
    await load();
    showToast(msg);
    return true;
  }

  async function save() {
    const name = form.name.trim();
    const tel = form.tel.replace(/\D/g, "");
    if (!name) return showToast("이름을 적어주세요");
    if (tel.length < 10) return showToast("휴대폰 번호를 확인해 주세요");
    const dup = customers.find((c) => c.tel === tel && c.id !== editing);
    if (dup && !confirm(`${dup.name} 님이 같은 번호로 이미 있습니다. 그래도 새로 만들까요?`)) return;

    const record: Customer = {
      id: editing || Date.now(),
      name,
      tel,
      co: form.co.trim(),
      bm: +form.bm || 0,
      bd: +form.bd || 0,
      stamp: +form.stamp || 0,
      visit: form.visit || today(),
      memo: form.memo.trim(),
      c1: form.c1,
      c2: form.c2,
      c3: form.c3,
      createdBy: customers.find((c) => c.id === editing)?.createdBy || userName,
    };
    setSaving(true);
    const ok = await upsert(record, `${name} 님 올렸습니다`);
    setSaving(false);
    if (ok) resetForm();
  }

  async function addStamp(c: Customer) {
    await upsert({ ...c, stamp: c.stamp + 1, visit: today() }, `${c.name} 님 도장 ${c.stamp + 1}개`);
  }

  function startEdit(c: Customer) {
    setEditing(c.id);
    setForm({
      name: c.name,
      tel: c.tel,
      co: c.co,
      bm: c.bm ? String(c.bm) : "",
      bd: c.bd ? String(c.bd) : "",
      stamp: String(c.stamp),
      visit: c.visit,
      memo: c.memo,
      c1: c.c1,
      c2: c.c2,
      c3: !!c.c3,
    });
    setTab("add");
    window.scrollTo(0, 0);
  }

  async function remove(c: Customer) {
    if (!confirm(`${c.name} 님을 장부에서 지울까요?`)) return;
    const res = await fetch(`/api/customers?id=${c.id}`, { method: "DELETE" });
    if (res.ok) {
      await load();
      showToast("지웠습니다");
    } else showToast("삭제에 실패했습니다");
  }

  function copyTel(c: Customer) {
    navigator.clipboard?.writeText(c.tel);
    showToast("번호 복사됨");
  }

  const month = new Date().getMonth() + 1;
  const bdayList = useMemo(
    () => customers.filter((c) => c.bm === month).sort((a, b) => a.bd - b.bd),
    [customers, month]
  );
  const awayList = useMemo(
    () =>
      customers
        .filter((c) => daysSince(c.visit) >= 21 && c.stamp >= 2)
        .sort((a, b) => daysSince(b.visit) - daysSince(a.visit)),
    [customers]
  );
  const listRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = customers.filter(
      (c) => !term || [c.name, c.tel, c.co, c.memo].join(" ").toLowerCase().includes(term)
    );
    rows.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "ko")
        : sort === "stamp"
        ? b.stamp - a.stamp
        : daysSince(a.visit) - daysSince(b.visit)
    );
    return rows;
  }, [customers, q, sort]);

  function exportCsv(kind: "bday" | "away" | "all") {
    const src = (kind === "bday" ? bdayList : kind === "away" ? awayList : customers).filter(
      (c) => c.c2
    );
    if (!src.length) return showToast("내보낼 손님이 없습니다");
    const csv = [
      "이름,휴대폰,회사,생일,도장,최근방문",
      ...src.map((c) =>
        [c.name, c.tel, c.co, c.bm ? `${c.bm}/${c.bd}` : "", c.stamp, c.visit]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n");
    download(`stayin_${kind}_${today()}.csv`, csv, true);
    showToast(`${src.length}명 내보냈습니다`);
  }

  async function restore(file: File) {
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error();
      if (!confirm(`손님 ${data.length}명을 불러옵니다. 지금 장부는 덮어씁니다.`)) return;
      const res = await fetch("/api/customers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      await load();
      showToast("불러왔습니다");
    } catch {
      showToast("백업 파일이 아니거나 실패했습니다");
    }
  }

  async function wipe() {
    if (!confirm("손님 정보를 전부 지웁니다. 되돌릴 수 없습니다.")) return;
    if (!confirm("정말 지울까요? 백업부터 받아두시는 걸 권합니다.")) return;
    const res = await fetch("/api/customers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([]),
    });
    if (res.ok) {
      await load();
      showToast("모두 지웠습니다");
    }
  }

  function renderTable(rows: Customer[], mode: "list" | "bday" | "away") {
    if (!rows.length)
      return (
        <div style={{ textAlign: "center", padding: "40px 20px" }} className="muted">
          <b style={{ display: "block", color: "var(--text)", marginBottom: 6 }}>
            {mode === "bday"
              ? "이번 달 생일인 손님이 없습니다"
              : mode === "away"
              ? "발길 끊긴 손님이 없습니다"
              : "아직 장부가 비어 있습니다"}
          </b>
          {mode === "list" ? "손님 등록 탭에서 스탬프카드를 옮겨 적어 주세요." : "좋은 신호입니다."}
        </div>
      );
    return (
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>손님</th>
              <th>휴대폰</th>
              <th>도장</th>
              <th>{mode === "bday" ? "생일" : "최근 방문"}</th>
              <th>동의</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const d = daysSince(c.visit);
              return (
                <tr key={c.id}>
                  <td>
                    <b>{c.name}</b>
                    {c.co && <div className="small muted">{c.co}</div>}
                    {c.memo && <div className="small muted">{c.memo}</div>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {fmtTel(c.tel)}{" "}
                    <button className="btn ghost sm" onClick={() => copyTel(c)}>
                      복사
                    </button>
                  </td>
                  <td style={{ color: "var(--accent-2)", fontWeight: 700 }}>{c.stamp}</td>
                  <td>
                    {mode === "bday" ? (
                      <b>
                        {c.bm}/{c.bd}
                      </b>
                    ) : (
                      <>
                        {c.visit || "-"}
                        <div className="small" style={{ color: d >= 21 ? "var(--red)" : "var(--muted)" }}>
                          {d > 9000 ? "기록 없음" : `${d}일 전`}
                        </div>
                      </>
                    )}
                  </td>
                  <td>
                    {c.c2 ? (
                      <span className="pill" style={{ color: "var(--green)", borderColor: "var(--green)" }}>
                        문자 가능
                      </span>
                    ) : (
                      <span className="pill" style={{ color: "var(--red)", borderColor: "var(--red)" }}>
                        발송 불가
                      </span>
                    )}{" "}
                    {c.c3 && <span className="pill">야간</span>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      <button className="btn sm" onClick={() => addStamp(c)}>
                        도장 +1
                      </button>
                      <button className="btn ghost sm" onClick={() => startEdit(c)}>
                        수정
                      </button>
                      <button className="btn ghost sm" onClick={() => remove(c)}>
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (loading) return <div className="muted">장부를 불러오는 중…</div>;

  return (
    <>
      <div className="tabs">
        {(
          [
            ["add", "손님 등록", null],
            ["list", "전체 명단", customers.length],
            ["bday", "이번 달 생일", bdayList.length],
            ["away", "3주 미방문", awayList.length],
            ["data", "내보내기", null],
          ] as [Tab, string, number | null][]
        ).map(([key, label, n]) => (
          <button key={key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
            {label}
            {n !== null && n > 0 ? ` ${n}` : ""}
          </button>
        ))}
      </div>

      {tab === "add" && (
        <div className="card">
          <h2>
            스탬프카드 옮겨 적기
            {editing && <span className="sub">{form.name} 님 고쳐 쓰는 중</span>}
          </h2>
          <div className="grid cols-3">
            <label className="field">
              <span className="cap">이름</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="김도아" />
            </label>
            <label className="field">
              <span className="cap">휴대폰</span>
              <input value={form.tel} onChange={(e) => setForm({ ...form, tel: e.target.value })} inputMode="numeric" placeholder="01012345678" />
            </label>
            <label className="field">
              <span className="cap">회사 · 팀</span>
              <input value={form.co} onChange={(e) => setForm({ ...form, co: e.target.value })} placeholder="한빛물산 마케팅팀" />
            </label>
            <label className="field">
              <span className="cap">생일</span>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <select value={form.bm} onChange={(e) => setForm({ ...form, bm: e.target.value })}>
                  <option value="">월</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}월
                    </option>
                  ))}
                </select>
                <select value={form.bd} onChange={(e) => setForm({ ...form, bd: e.target.value })}>
                  <option value="">일</option>
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}일
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="field">
              <span className="cap">현재 도장</span>
              <input type="number" min={0} value={form.stamp} onChange={(e) => setForm({ ...form, stamp: e.target.value })} />
            </label>
            <label className="field">
              <span className="cap">최근 방문일</span>
              <input type="date" value={form.visit} onChange={(e) => setForm({ ...form, visit: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span className="cap">메모</span>
            <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="위스키 하이볼 선호 / 총무" />
          </label>

          <div className="row" style={{ gap: 18, padding: "12px 14px", background: "var(--card-2)", border: "1px dashed var(--border)", borderRadius: 10 }}>
            <label className="row" style={{ gap: 8, cursor: "pointer" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={form.c1} onChange={(e) => setForm({ ...form, c1: e.target.checked })} />
              개인정보 수집·이용 동의
            </label>
            <label className="row" style={{ gap: 8, cursor: "pointer" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={form.c2} onChange={(e) => setForm({ ...form, c2: e.target.checked })} />
              광고성 정보 수신 동의
            </label>
            <label className="row" style={{ gap: 8, cursor: "pointer" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={form.c3} onChange={(e) => setForm({ ...form, c3: e.target.checked })} />
              야간(21~08시) 수신 동의
            </label>
          </div>
          <p className="small muted">
            광고 문자는 <b>광고성 정보 수신 동의</b>를 받은 손님에게만 발송할 수 있습니다. 동의가 없는 손님은 내보내기에서 자동으로 빠집니다.
          </p>

          <div className="row mt">
            <button className="btn" onClick={save} disabled={saving}>
              {saving ? "올리는 중…" : editing ? "고친 내용 저장" : "장부에 올리기"}
            </button>
            <button className="btn ghost" onClick={resetForm}>
              비우기
            </button>
          </div>
        </div>
      )}

      {tab === "list" && (
        <div className="card">
          <div className="row" style={{ marginBottom: 14 }}>
            <input style={{ maxWidth: 260 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 번호 · 회사로 찾기" />
            <select style={{ width: "auto" }} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="recent">최근 방문순</option>
              <option value="stamp">도장 많은순</option>
              <option value="name">이름순</option>
            </select>
          </div>
          {renderTable(listRows, "list")}
          <div className="grid cols-3 mt">
            <div className="stat">
              <div className="label">전체 손님</div>
              <div className="value">{customers.length}</div>
            </div>
            <div className="stat">
              <div className="label">문자 발송 가능</div>
              <div className="value green">{customers.filter((c) => c.c2).length}</div>
            </div>
            <div className="stat">
              <div className="label">누적 도장</div>
              <div className="value accent">{customers.reduce((a, c) => a + (c.stamp || 0), 0)}</div>
            </div>
          </div>
        </div>
      )}

      {tab === "bday" && (
        <div className="card">
          <h2>
            {month}월 생일인 손님
            <span className="sub">생일 주간 초입에 미리 보내세요. 당일 문자는 이미 약속이 잡혀 있습니다.</span>
          </h2>
          {renderTable(bdayList, "bday")}
        </div>
      )}

      {tab === "away" && (
        <div className="card">
          <h2>
            3주 넘게 안 오신 손님
            <span className="sub">두 번 이상 오셨다가 발길이 끊긴 분이 먼저 뜹니다. 여기가 제일 잘 돌아옵니다.</span>
          </h2>
          {renderTable(awayList, "away")}
        </div>
      )}

      {tab === "data" && (
        <>
          <div className="card">
            <h2>문자 발송용 명단 내보내기</h2>
            <p className="small muted" style={{ marginTop: -6 }}>
              광고 수신 동의한 손님만 담깁니다. 받은 CSV를 솔라피·알리고 같은 발송 사이트에 그대로 올리시면 됩니다.
            </p>
            <div className="row">
              <button className="btn" onClick={() => exportCsv("bday")}>
                이번 달 생일자 CSV
              </button>
              <button className="btn" onClick={() => exportCsv("away")}>
                3주 미방문자 CSV
              </button>
              <button className="btn ghost" onClick={() => exportCsv("all")}>
                전체 명단 CSV
              </button>
            </div>
          </div>
          <div className="card">
            <h2>백업{isOwner ? "과 복원" : ""}</h2>
            <p className="small muted" style={{ marginTop: -6 }}>
              손님 정보는 서버의 장부 파일에 저장되어 모든 기기에서 같이 보입니다. 한 달에 한 번 백업을 받아두시면 안전합니다.
            </p>
            <div className="row">
              <button
                className="btn ghost"
                onClick={() => {
                  if (!customers.length) return showToast("백업할 내용이 없습니다");
                  download(`stayin_backup_${today()}.json`, JSON.stringify(customers), false);
                  showToast("백업 받았습니다");
                }}
              >
                백업 파일 받기
              </button>
              {isOwner && (
                <>
                  <button className="btn ghost" onClick={() => fileRef.current?.click()}>
                    백업 불러오기
                  </button>
                  <button className="btn ghost" style={{ borderColor: "var(--red)", color: "var(--red)" }} onClick={wipe}>
                    전부 지우기
                  </button>
                </>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) restore(f);
                e.target.value = "";
              }}
            />
          </div>
        </>
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 26,
            transform: "translateX(-50%)",
            background: "var(--accent)",
            color: "#1a1509",
            padding: "11px 20px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            zIndex: 99,
            boxShadow: "var(--shadow)",
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
