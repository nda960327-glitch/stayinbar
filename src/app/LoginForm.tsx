"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  name: string;
  role: string;
  position: string;
}

export default function LoginForm({ users, business }: { users: User[]; business: string }) {
  const router = useRouter();
  const [id, setId] = useState(users[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "로그인 실패");
        return;
      }
      router.push(data.session.role === "owner" ? "/owner" : "/me");
      router.refresh();
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="logo">
          <div className="big">
            STAY IN <span>BAR</span>
          </div>
          <div className="muted small">{business} · 매출 · 급여 리포트</div>
        </div>
        <form onSubmit={submit}>
          <label className="field">
            <span className="cap">직원 선택</span>
            <select value={id} onChange={(e) => setId(e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.position}
                  {u.role === "owner" ? " (사장)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="cap">PIN 번호</span>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              autoFocus
            />
          </label>
          {error && <div className="notice warn mt-s">{error}</div>}
          <button className="btn mt" style={{ width: "100%" }} disabled={loading}>
            {loading ? <span className="spinner" /> : "로그인"}
          </button>
        </form>
        <p className="muted small mt">
          초기 PIN은 관리자에게 문의하세요. 사장님은 설정에서 PIN을 변경할 수 있습니다.
        </p>
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <a href="/exec" className="btn ghost sm" style={{ width: "100%", textAlign: "center", display: "block" }}>
            📊 임원 대시보드 입장
          </a>
        </div>
      </div>
    </div>
  );
}
