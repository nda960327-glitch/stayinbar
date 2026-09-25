"use client";

import { useCallback, useEffect, useState } from "react";

interface SheetItem {
  label: string;
  text: string;
}

interface Person {
  id: string;
  name: string;
  position: string;
  note: { text: string; updatedAt: number } | null;
  sheet: SheetItem[];
}

const shift = (date: string, days: number) =>
  new Date(new Date(date + "T00:00:00").getTime() + days * 86400000).toISOString().slice(0, 10);

const todayKST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

const label = (d: string) => {
  const t = todayKST();
  if (d === t) return "오늘";
  if (d === shift(t, -1)) return "어제";
  const [, m, day] = d.split("-");
  return `${Number(m)}월 ${Number(day)}일`;
};

export default function DailyLog() {
  const [date, setDate] = useState(todayKST());
  const [people, setPeople] = useState<Person[]>([]);
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (d: string) => {
      try {
        const res = await fetch(`/api/worklog?date=${d}`);
        if (!res.ok) return;
        const data = await res.json();
        setPeople(data.people ?? []);
        setMe(data.me ?? null);
        setCanWrite(!!data.canWrite);
        const mine = (data.people ?? []).find((p: Person) => p.id === data.me?.id);
        // 내가 쓰던 중이면 덮어쓰지 않는다
        setDraft((prev) => (dirty ? prev : mine?.note?.text ?? ""));
      } finally {
        setLoading(false);
      }
    },
    [dirty]
  );

  useEffect(() => {
    setDirty(false);
    load(date);
  }, [date, load]);

  useEffect(() => {
    const t = setInterval(() => load(date), 60000);
    return () => clearInterval(t);
  }, [date, load]);

  async function save() {
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/worklog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, text: draft }),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMsg(d.error ?? "저장하지 못했습니다.");
      return;
    }
    setMsg("저장했습니다");
    setDirty(false);
    load(date);
    setTimeout(() => setMsg(""), 2000);
  }

  const written = people.filter((p) => p.note || p.sheet.length > 0);
  const quiet = people.filter((p) => !p.note && p.sheet.length === 0);

  return (
    <div className="card mt">
      <div className="row spread">
        <div>
          <h2 style={{ margin: 0 }}>📔 오늘 한 일</h2>
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            각자 오늘 특별히 한 일. 업무일지에 쓴 내용도 같이 보입니다.
          </p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn ghost sm" onClick={() => setDate(shift(date, -1))}>‹</button>
          <span className="pill">{label(date)}</span>
          <button
            className="btn ghost sm"
            onClick={() => setDate(shift(date, 1))}
            disabled={date >= todayKST()}
          >
            ›
          </button>
        </div>
      </div>

      {/* 내가 쓰는 칸 */}
      {me && canWrite && (
        <div className="mt-s">
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDirty(true);
            }}
            rows={2}
            placeholder={`${label(date)} 특별히 한 일을 적어주세요 (예: 신메뉴 시음 3종 테스트, 냉장고 수리 기사 방문)`}
            style={{ width: "100%", resize: "vertical" }}
          />
          <div className="row spread mt-s">
            <span className="muted small">{msg}</span>
            <button className="btn sm" onClick={save} disabled={saving}>
              {saving ? "저장 중…" : "남기기"}
            </button>
          </div>
        </div>
      )}

      {loading && <p className="muted small mt-s">불러오는 중…</p>}

      {!loading && written.length === 0 && (
        <p className="muted small mt-s">아직 아무도 남기지 않았습니다.</p>
      )}

      <div className="mt-s">
        {written.map((p) => (
          <div
            key={p.id}
            className="card"
            style={{ background: "var(--bg-2)", marginTop: 8, padding: "10px 12px" }}
          >
            <div className="row spread">
              <strong>
                {p.name} <span className="muted small">{p.position}</span>
              </strong>
              {p.id === me?.id && <span className="pill small">나</span>}
            </div>
            {p.note && <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{p.note.text}</p>}
            {p.sheet.map((s, i) => (
              <p key={i} className="small" style={{ margin: "6px 0 0" }}>
                <span className="muted">[{s.label}]</span> {s.text}
              </p>
            ))}
          </div>
        ))}
      </div>

      {!loading && quiet.length > 0 && (
        <p className="muted small mt-s">
          아직 안 쓴 사람: {quiet.map((p) => p.name).join(", ")}
        </p>
      )}
    </div>
  );
}
