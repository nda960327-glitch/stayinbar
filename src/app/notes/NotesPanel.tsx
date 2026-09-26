"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Note } from "@/lib/notes";

const ALL = "__all__";

interface Person {
  id: string;
  name: string;
  position: string;
}

type Tab = "받은" | "보낸" | "중요" | "휴지통";
const TABS: Tab[] = ["받은", "보낸", "중요", "휴지통"];

const timeText = (at: number) => {
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`
    : `${d.getMonth() + 1}/${d.getDate()}`;
};

export default function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [tab, setTab] = useState<Tab>("받은");
  const [open, setOpen] = useState<string | null>(null); // threadId
  const [writing, setWriting] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notes");
      if (!res.ok) {
        setErr(res.status === 401 ? "로그인이 필요합니다." : "쪽지를 불러오지 못했습니다.");
        return;
      }
      const d = await res.json();
      setNotes(d.notes ?? []);
      setPeople(d.people ?? []);
      setMe(d.me ?? null);
      setErr("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const patch = useCallback(async (action: string, ids: string[]) => {
    const res = await fetch("/api/notes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ids }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(d.error ?? "처리하지 못했습니다.");
      return;
    }
    setNotes(d.notes ?? []);
  }, []);

  const nameOf = useCallback(
    (id: string) => (id === ALL ? "전체" : people.find((p) => p.id === id)?.name ?? (id === me?.id ? "나" : id)),
    [people, me]
  );

  // 대화(스레드) 단위로 묶어서 보여준다
  const threads = useMemo(() => {
    if (!me) return [];
    const byThread = new Map<string, Note[]>();
    for (const n of notes) {
      byThread.set(n.threadId, [...(byThread.get(n.threadId) ?? []), n]);
    }
    const list = Array.from(byThread.entries()).map(([id, ns]) => {
      const sorted = [...ns].sort((a, b) => a.at - b.at);
      const last = sorted[sorted.length - 1];
      return {
        id,
        notes: sorted,
        last,
        subject: sorted[0].subject,
        unread: sorted.some((n) => n.from.id !== me.id && !n.readBy.includes(me.id)),
        starred: sorted.some((n) => n.starredBy.includes(me.id)),
        trashed: sorted.every((n) => n.trashedBy.includes(me.id)),
        mineOnly: sorted.every((n) => n.from.id === me.id),
        hasIncoming: sorted.some((n) => n.from.id !== me.id),
      };
    });
    const filtered = list.filter((t) => {
      if (tab === "휴지통") return t.trashed;
      if (t.trashed) return false;
      if (tab === "중요") return t.starred;
      if (tab === "보낸") return t.notes.some((n) => n.from.id === me.id);
      return t.hasIncoming; // 받은
    });
    return filtered.sort((a, b) => b.last.at - a.last.at);
  }, [notes, tab, me]);

  const unreadTotal = useMemo(
    () => (me ? notes.filter((n) => n.from.id !== me.id && !n.readBy.includes(me.id) && !n.trashedBy.includes(me.id)).length : 0),
    [notes, me]
  );

  if (loading) return <div className="card">불러오는 중…</div>;

  return (
    <>
      <div className="card">
        <div className="row spread">
          <div>
            <h2 style={{ margin: 0 }}>
              ✉️ 쪽지함 {unreadTotal > 0 && <span className="pill">{unreadTotal}</span>}
            </h2>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              직원끼리 주고받는 쪽지와 할일 알림이 여기에 모입니다.
            </p>
          </div>
          <button className="btn sm" onClick={() => setWriting((v) => !v)}>
            {writing ? "닫기" : "쪽지 쓰기"}
          </button>
        </div>

        {err && <div className="notice warn mt-s">{err}</div>}

        <div className="tabs mt-s" style={{ overflowX: "auto" }}>
          {TABS.map((t) => (
            <button
              key={t}
              className={`tab ${tab === t ? "active" : ""}`}
              onClick={() => {
                setTab(t);
                setOpen(null);
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {writing && (
        <Compose
          people={people}
          onSent={() => {
            setWriting(false);
            load();
          }}
          onCancel={() => setWriting(false)}
          setErr={setErr}
        />
      )}

      {threads.length === 0 && (
        <div className="card mt" style={{ textAlign: "center" }}>
          <p className="muted">쪽지가 없습니다.</p>
        </div>
      )}

      {threads.map((t) => {
        const isOpen = open === t.id;
        return (
          <div key={t.id} className="card mt" style={{ background: "var(--bg-2)" }}>
            <div
              className="row spread"
              style={{ cursor: "pointer", gap: 8 }}
              onClick={() => {
                setOpen(isOpen ? null : t.id);
                if (!isOpen && t.unread && me) {
                  patch("read", t.notes.filter((n) => n.from.id !== me.id).map((n) => n.id));
                }
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: t.unread ? 700 : 500 }}>
                  {t.unread && <span style={{ color: "var(--accent)" }}>● </span>}
                  {t.last.auto && "🔔 "}
                  {t.subject}
                  {t.notes.length > 1 && <span className="muted small"> ({t.notes.length})</span>}
                </div>
                <div className="muted small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.last.from.id === me?.id ? `나 → ${t.last.to.map(nameOf).join(", ")}` : t.last.from.name} · {t.last.body}
                </div>
              </div>
              <span className="muted small" style={{ whiteSpace: "nowrap" }}>{timeText(t.last.at)}</span>
            </div>

            {isOpen && (
              <div className="mt-s">
                {t.notes.map((n) => (
                  <div key={n.id} style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                    <div className="row spread">
                      <strong className="small">
                        {n.from.id === me?.id ? "나" : n.from.name}
                        <span className="muted"> → {n.to.map(nameOf).join(", ")}</span>
                      </strong>
                      <span className="muted small">{timeText(n.at)}</span>
                    </div>
                    <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{n.body}</p>
                    {n.link && (
                      <a className="btn ghost sm mt-s" href={n.link}>
                        보러 가기
                      </a>
                    )}
                  </div>
                ))}

                <div className="row mt-s" style={{ gap: 6, flexWrap: "wrap" }}>
                  <button className="btn ghost sm" onClick={() => patch("star", t.notes.map((n) => n.id))}>
                    {t.starred ? "중요 해제" : "중요 표시"}
                  </button>
                  {tab === "휴지통" ? (
                    <>
                      <button className="btn ghost sm" onClick={() => patch("restore", t.notes.map((n) => n.id))}>
                        되살리기
                      </button>
                      <button
                        className="btn ghost sm"
                        onClick={() => {
                          if (confirm("완전히 지울까요? 되돌릴 수 없습니다.")) {
                            patch("purge", t.notes.map((n) => n.id));
                          }
                        }}
                      >
                        완전 삭제
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn ghost sm" onClick={() => patch("unread", t.notes.map((n) => n.id))}>
                        안 읽음으로
                      </button>
                      <button className="btn ghost sm" onClick={() => patch("trash", t.notes.map((n) => n.id))}>
                        휴지통
                      </button>
                    </>
                  )}
                </div>

                {tab !== "휴지통" && me && (
                  <Reply
                    threadId={t.id}
                    subject={t.subject}
                    to={Array.from(
                      new Set(
                        t.notes
                          .flatMap((n) => [n.from.id, ...n.to])
                          .filter((id) => id !== me.id && id !== ALL)
                      )
                    )}
                    onSent={load}
                    setErr={setErr}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function Compose({
  people,
  onSent,
  onCancel,
  setErr,
}: {
  people: Person[];
  onSent: () => void;
  onCancel: () => void;
  setErr: (s: string) => void;
}) {
  const [to, setTo] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setTo((cur) => {
      if (id === ALL) return cur.includes(ALL) ? [] : [ALL];
      const next = cur.filter((x) => x !== ALL);
      return next.includes(id) ? next.filter((x) => x !== id) : [...next, id];
    });

  async function send() {
    setBusy(true);
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, body }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(d.error ?? "보내지 못했습니다.");
      return;
    }
    onSent();
  }

  return (
    <div className="card mt">
      <h2 style={{ margin: "0 0 8px" }}>쪽지 쓰기</h2>
      <p className="cap">받는 사람</p>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <button type="button" className={`btn sm ${to.includes(ALL) ? "" : "ghost"}`} onClick={() => toggle(ALL)}>
          전체
        </button>
        {people.map((p) => (
          <button key={p.id} type="button" className={`btn sm ${to.includes(p.id) ? "" : "ghost"}`} onClick={() => toggle(p.id)}>
            {p.name}
          </button>
        ))}
      </div>
      <input
        className="mt-s"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="제목 (비우면 '쪽지')"
        style={{ width: "100%" }}
      />
      <textarea
        className="mt-s"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="내용"
        style={{ width: "100%", resize: "vertical" }}
      />
      <div className="row mt-s" style={{ justifyContent: "flex-end", gap: 8 }}>
        <button className="btn ghost sm" onClick={onCancel}>취소</button>
        <button className="btn sm" onClick={send} disabled={busy || to.length === 0 || !body.trim()}>
          {busy ? "보내는 중…" : "보내기"}
        </button>
      </div>
    </div>
  );
}

function Reply({
  threadId,
  subject,
  to,
  onSent,
  setErr,
}: {
  threadId: string;
  subject: string;
  to: string[];
  onSent: () => void;
  setErr: (s: string) => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, body, threadId }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(d.error ?? "보내지 못했습니다.");
      return;
    }
    setBody("");
    onSent();
  }

  if (to.length === 0) return null;

  return (
    <div className="row mt-s" style={{ gap: 6 }}>
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send()}
        placeholder="답장…"
        style={{ flex: 1, minWidth: 0 }}
      />
      <button className="btn sm" onClick={send} disabled={busy || !body.trim()}>
        보내기
      </button>
    </div>
  );
}
