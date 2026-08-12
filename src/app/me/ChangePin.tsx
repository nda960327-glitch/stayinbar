"use client";

import { useState } from "react";

// 직원이 자기 PIN을 스스로 바꾸는 칸
export default function ChangePin() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next !== again) {
      setMsg({ ok: false, text: "새 PIN 두 칸이 서로 다릅니다." });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/me/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "변경 실패" });
        return;
      }
      setCurrent("");
      setNext("");
      setAgain("");
      setMsg({ ok: true, text: "PIN을 바꿨습니다. 다음 로그인부터 새 PIN을 쓰세요." });
    } catch {
      setMsg({ ok: false, text: "네트워크 오류" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card mt">
      <div className="row spread">
        <h2 style={{ margin: 0 }}>내 PIN 변경</h2>
        <button className="btn ghost sm" onClick={() => setOpen(!open)}>
          {open ? "닫기" : "바꾸기"}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} style={{ marginTop: 14 }}>
          <p className="muted small" style={{ marginTop: 0 }}>
            로그인과 단골 장부에 함께 쓰는 PIN입니다. 숫자 4~12자리.
          </p>
          <label className="field">
            <span className="cap">지금 쓰는 PIN</span>
            <input
              type="password"
              inputMode="numeric"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label className="field">
            <span className="cap">새 PIN</span>
            <input
              type="password"
              inputMode="numeric"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="field">
            <span className="cap">새 PIN 다시 한 번</span>
            <input
              type="password"
              inputMode="numeric"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          {msg && <div className={`notice ${msg.ok ? "" : "warn"} mt-s`}>{msg.text}</div>}
          <button className="btn mt" disabled={saving} style={{ width: "100%" }}>
            {saving ? <span className="spinner" /> : "PIN 바꾸기"}
          </button>
        </form>
      )}
    </div>
  );
}
