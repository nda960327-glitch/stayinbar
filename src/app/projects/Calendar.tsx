"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CalEvent, EventKind } from "@/lib/calendar";

const KINDS: EventKind[] = ["일정", "이벤트", "발주", "점검", "휴무"];
const KIND_COLOR: Record<EventKind, string> = {
  일정: "var(--blue)",
  이벤트: "var(--accent)",
  발주: "var(--green)",
  점검: "var(--muted)",
  휴무: "var(--red)",
};

interface Deadline {
  date: string;
  kind: "project" | "task";
  title: string;
  who: string;
  done: boolean;
  projectId: string;
}

const todayKST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function monthShift(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export default function Calendar() {
  const [month, setMonth] = useState(todayKST().slice(0, 7));
  const [sel, setSel] = useState(todayKST());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [logDays, setLogDays] = useState<Record<string, string[]>>({});
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async (m: string) => {
    const res = await fetch(`/api/calendar?month=${m}`);
    if (!res.ok) {
      setErr(res.status === 401 ? "로그인이 필요합니다." : "달력을 불러오지 못했습니다.");
      return;
    }
    const d = await res.json();
    setEvents(d.events ?? []);
    setDeadlines(d.deadlines ?? []);
    setLogDays(d.logDays ?? {});
    setMe(d.me ?? null);
    setReadOnly(!!d.readOnly);
    setIsOwner(!!d.isOwner);
    setErr("");
  }, []);

  useEffect(() => {
    load(month);
  }, [month, load]);

  // 달력 칸 (앞뒤 달 날짜로 6주를 채운다)
  const cells = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const prevDays = new Date(y, m - 1, 0).getDate();
    const out: { date: string; day: number; dim: boolean }[] = [];
    for (let i = startDay - 1; i >= 0; i--) {
      const d = prevDays - i;
      const pm = monthShift(month, -1);
      out.push({ date: `${pm}-${pad(d)}`, day: d, dim: true });
    }
    for (let d = 1; d <= daysInMonth; d++) out.push({ date: ymd(y, m, d), day: d, dim: false });
    let next = 1;
    while (out.length % 7 !== 0 || out.length < 35) {
      const nm = monthShift(month, 1);
      out.push({ date: `${nm}-${pad(next)}`, day: next, dim: true });
      next += 1;
    }
    return out;
  }, [month]);

  const eventsOn = useCallback(
    (date: string) => events.filter((e) => e.start <= date && e.end >= date),
    [events]
  );
  const deadlinesOn = useCallback(
    (date: string) => deadlines.filter((d) => d.date === date),
    [deadlines]
  );

  const selEvents = eventsOn(sel);
  const selDeadlines = deadlinesOn(sel);
  const selLogs = logDays[sel] ?? [];

  async function send(payload: Record<string, unknown>) {
    const res = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(d.error ?? "처리하지 못했습니다.");
      return false;
    }
    setErr("");
    await load(month);
    return true;
  }

  const [y, m] = month.split("-").map(Number);

  return (
    <div className="card mt">
      <div className="row spread">
        <div>
          <h2 style={{ margin: 0 }}>📅 달력</h2>
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            일정과 마감이 한눈에. 날짜를 누르면 그 날 내용이 아래에 보입니다.
          </p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn ghost sm" onClick={() => setMonth(monthShift(month, -1))}>‹</button>
          <span className="pill">{y}년 {m}월</span>
          <button className="btn ghost sm" onClick={() => setMonth(monthShift(month, 1))}>›</button>
          <button
            className="btn ghost sm"
            onClick={() => {
              setMonth(todayKST().slice(0, 7));
              setSel(todayKST());
            }}
          >
            오늘
          </button>
        </div>
      </div>

      {err && <div className="notice warn mt-s">{err}</div>}

      <div className="cal-grid mt-s">
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
          <div key={d} className="cal-head">{d}</div>
        ))}
        {cells.map((c, i) => {
          const evs = eventsOn(c.date);
          const dls = deadlinesOn(c.date);
          const logs = logDays[c.date] ?? [];
          const dow = i % 7;
          return (
            <button
              key={c.date + i}
              type="button"
              className={`cal-day ${c.dim ? "dim" : ""} ${c.date === todayKST() ? "today" : ""} ${
                c.date === sel ? "sel" : ""
              }`}
              onClick={() => setSel(c.date)}
            >
              <span className={`cal-date ${dow === 0 ? "sun" : dow === 6 ? "sat" : ""}`}>
                {c.day}
                {logs.length > 0 && <span className="cal-dot" title={`업무일지 ${logs.length}건`} />}
              </span>
              {evs.slice(0, 2).map((e) => (
                <span key={e.id} className="cal-chip" style={{ borderLeft: `3px solid ${KIND_COLOR[e.kind]}` }}>
                  {e.title}
                </span>
              ))}
              {dls.slice(0, 2).map((d, j) => (
                <span
                  key={j}
                  className="cal-chip"
                  style={{ opacity: d.done ? 0.45 : 1, textDecoration: d.done ? "line-through" : "none" }}
                >
                  {d.kind === "project" ? "🏁" : "✅"} {d.title}
                </span>
              ))}
              {evs.length + dls.length > 4 && (
                <span className="cal-chip muted">+{evs.length + dls.length - 4}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 고른 날 */}
      <div className="mt">
        <div className="row spread">
          <strong>
            {sel.slice(5, 7).replace(/^0/, "")}월 {sel.slice(8, 10).replace(/^0/, "")}일
            {sel === todayKST() && <span className="muted small"> · 오늘</span>}
          </strong>
          {!readOnly && (
            <button className="btn sm" onClick={() => setAdding((v) => !v)}>
              {adding ? "닫기" : "+ 일정"}
            </button>
          )}
        </div>

        {adding && !readOnly && (
          <NewEvent date={sel} onDone={() => setAdding(false)} send={send} />
        )}

        {selEvents.length === 0 && selDeadlines.length === 0 && selLogs.length === 0 && (
          <p className="muted small mt-s">이 날은 아무것도 없습니다.</p>
        )}

        {selEvents.map((e) => (
          <div key={e.id} className="row spread" style={{ padding: "6px 0" }}>
            <span>
              <span className="pill small" style={{ background: KIND_COLOR[e.kind], color: "#12100c" }}>
                {e.kind}
              </span>{" "}
              {e.title}
              {e.start !== e.end && (
                <span className="muted small"> · {e.start.slice(5)} ~ {e.end.slice(5)}</span>
              )}
              {e.memo && <div className="muted small">{e.memo}</div>}
              <div className="muted small">{e.by.name}</div>
            </span>
            {!readOnly && me && (e.by.id === me.id || isOwner) && (
              <button className="btn ghost sm" onClick={() => send({ action: "event.delete", id: e.id })}>
                ×
              </button>
            )}
          </div>
        ))}

        {selDeadlines.map((d, i) => (
          <div key={i} className="row spread" style={{ padding: "4px 0" }}>
            <span className={d.done ? "muted" : ""}>
              {d.kind === "project" ? "🏁 프로젝트 마감" : "✅ 할일"} · {d.title}
              {d.who && <span className="muted small"> · {d.who}</span>}
            </span>
            <span className="muted small">{d.done ? "완료" : "예정"}</span>
          </div>
        ))}

        {selLogs.length > 0 && (
          <p className="muted small mt-s">📔 오늘 한 일 남긴 사람: {selLogs.join(", ")}</p>
        )}
      </div>
    </div>
  );
}

function NewEvent({
  date,
  onDone,
  send,
}: {
  date: string;
  onDone: () => void;
  send: (p: Record<string, unknown>) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<EventKind>("일정");
  const [end, setEnd] = useState(date);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setEnd(date), [date]);

  return (
    <div className="card mt-s" style={{ background: "var(--bg-2)" }}>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {KINDS.map((k) => (
          <button key={k} type="button" className={`btn sm ${kind === k ? "" : "ghost"}`} onClick={() => setKind(k)}>
            {k}
          </button>
        ))}
      </div>
      <input
        className="mt-s"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="무엇을 하나요? (예: 주류 발주, 단체 예약 12명)"
        style={{ width: "100%" }}
      />
      <input
        className="mt-s"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="메모 (선택)"
        style={{ width: "100%" }}
      />
      <div className="row mt-s spread">
        <label className="row small" style={{ gap: 6 }}>
          <span className="muted">끝나는 날</span>
          <input type="date" value={end} min={date} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn ghost sm" onClick={onDone}>취소</button>
          <button
            className="btn sm"
            disabled={busy || !title.trim()}
            onClick={async () => {
              setBusy(true);
              const ok = await send({ action: "event.add", start: date, end, title, kind, memo });
              setBusy(false);
              if (ok) {
                setTitle("");
                setMemo("");
                onDone();
              }
            }}
          >
            {busy ? "저장 중…" : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}
