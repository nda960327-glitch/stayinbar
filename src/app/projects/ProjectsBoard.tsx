"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Activity, Project, ProjectStatus, Task } from "@/lib/projects";

const STATUSES: ProjectStatus[] = ["진행중", "예정", "보류", "완료"];
const STATUS_COLOR: Record<ProjectStatus, string> = {
  진행중: "var(--green)",
  예정: "var(--blue)",
  보류: "var(--muted)",
  완료: "var(--accent)",
};

interface Person {
  id: string;
  name: string;
  position: string;
}

const today = () => new Date().toISOString().slice(0, 10);

// 마감까지 며칠 남았는지 (지났으면 음수)
function daysLeft(due: string): number | null {
  if (!due) return null;
  const d = new Date(due + "T00:00:00");
  const t = new Date(today() + "T00:00:00");
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}

function DueBadge({ due, done }: { due: string; done?: boolean }) {
  const n = daysLeft(due);
  if (n === null) return null;
  const late = n < 0 && !done;
  const soon = n >= 0 && n <= 3 && !done;
  return (
    <span
      className="small"
      style={{
        color: late ? "var(--red)" : soon ? "var(--accent-2)" : "var(--muted)",
        fontWeight: late || soon ? 600 : 400,
      }}
    >
      {due.slice(5)} {done ? "" : late ? `· ${-n}일 지남` : n === 0 ? "· 오늘" : `· D-${n}`}
    </span>
  );
}

function progressOf(p: Project) {
  if (p.tasks.length === 0) return p.status === "완료" ? 100 : 0;
  return Math.round((p.tasks.filter((t) => t.done).length / p.tasks.length) * 100);
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ height: 6, borderRadius: 999, background: "var(--card-2)", overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", background: color, transition: "width .3s" }} />
    </div>
  );
}

const timeAgo = (at: number) => {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
};

export default function ProjectsBoard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine">("all");

  const nameOf = useCallback(
    (id: string) => people.find((p) => p.id === id)?.name ?? "",
    [people]
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) {
        setErr(res.status === 401 ? "로그인이 필요합니다." : "불러오지 못했습니다.");
        return;
      }
      const d = await res.json();
      setProjects(d.projects ?? []);
      setActivity(d.activity ?? []);
      setPeople(d.people ?? []);
      setMe(d.me ?? null);
      setReadOnly(!!d.readOnly);
      setIsOwner(!!d.isOwner);
      setErr("");
    } catch {
      setErr("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // 여러 명이 같이 쓰므로 30초마다 새로 받아온다
    const t = setInterval(load, 30000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const send = useCallback(async (payload: Record<string, unknown>) => {
    setErr("");
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(d.error ?? "처리하지 못했습니다.");
      return false;
    }
    setProjects(d.projects ?? []);
    setActivity(d.activity ?? []);
    return true;
  }, []);

  // 나에게 맡겨진, 아직 안 끝난 할일
  const myTasks = useMemo(() => {
    if (!me) return [];
    const list: { p: Project; t: Task }[] = [];
    for (const p of projects) {
      for (const t of p.tasks) {
        if (!t.done && t.assignee === me.id) list.push({ p, t });
      }
    }
    return list.sort((a, b) => (a.t.due || "9999").localeCompare(b.t.due || "9999"));
  }, [projects, me]);

  const shown = useMemo(() => {
    const rank = (s: ProjectStatus) => STATUSES.indexOf(s);
    const list =
      filter === "mine" && me
        ? projects.filter(
            (p) => p.members.includes(me.id) || p.by.id === me.id || p.tasks.some((t) => t.assignee === me.id)
          )
        : projects;
    return [...list].sort(
      (a, b) => rank(a.status) - rank(b.status) || (a.due || "9999").localeCompare(b.due || "9999")
    );
  }, [projects, filter, me]);

  if (loading) return <div className="card">불러오는 중…</div>;

  return (
    <>
      <div className="card">
        <div className="row spread">
          <div>
            <h2 style={{ margin: 0 }}>🛠 함께 하는 일</h2>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              지금 굴러가는 것들. 카드를 누르면 할일과 기록을 적을 수 있어요.
            </p>
          </div>
          {!readOnly && (
            <button className="btn sm" onClick={() => setAdding((v) => !v)}>
              {adding ? "닫기" : "+ 새 프로젝트"}
            </button>
          )}
        </div>

        {err && <div className="notice warn mt-s">{err}</div>}
        {readOnly && <p className="muted small mt-s">임원 계정은 보기만 됩니다.</p>}

        <div className="tabs mt-s">
          <button className={`tab ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
            전체 {projects.length}
          </button>
          <button className={`tab ${filter === "mine" ? "active" : ""}`} onClick={() => setFilter("mine")}>
            내 것
          </button>
        </div>
      </div>

      {adding && !readOnly && <NewProject people={people} onDone={() => setAdding(false)} send={send} />}

      {myTasks.length > 0 && (
        <div className="card mt">
          <h2 style={{ margin: 0 }}>
            ✅ 내 할일 <span className="sub">{myTasks.length}건</span>
          </h2>
          <div className="mt-s">
            {myTasks.slice(0, 8).map(({ p, t }) => (
              <div key={t.id} className="row spread" style={{ padding: "6px 0", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => send({ action: "task.toggle", projectId: p.id, taskId: t.id })}
                  />
                  <span>
                    {t.text} <span className="muted small">· {p.emoji} {p.title}</span>
                  </span>
                </label>
                <DueBadge due={t.due} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid cols-2 mt">
        {shown.map((p) => (
          <ProjectCard
            key={p.id}
            p={p}
            me={me}
            isOwner={isOwner}
            readOnly={readOnly}
            people={people}
            nameOf={nameOf}
            open={open === p.id}
            onToggle={() => setOpen(open === p.id ? null : p.id)}
            send={send}
          />
        ))}
      </div>

      {shown.length === 0 && (
        <div className="card mt" style={{ textAlign: "center" }}>
          <p className="muted">아직 없어요. 같이 할 일을 하나 만들어 보세요.</p>
        </div>
      )}

      <div className="card mt">
        <h2 style={{ margin: 0 }}>📋 최근 활동</h2>
        <p className="muted small" style={{ margin: "4px 0 8px" }}>누가 무엇을 했는지 남습니다.</p>
        {activity.length === 0 && <p className="muted small">아직 기록이 없습니다.</p>}
        {activity.slice(0, 20).map((a) => (
          <div key={a.id} className="row spread" style={{ padding: "4px 0" }}>
            <span className="small">
              <strong>{a.by.name}</strong> {a.text}
            </span>
            <span className="muted small">{timeAgo(a.at)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ── 새 프로젝트 ── */
function NewProject({
  people,
  onDone,
  send,
}: {
  people: Person[];
  onDone: () => void;
  send: (p: Record<string, unknown>) => Promise<boolean>;
}) {
  const [emoji, setEmoji] = useState("📌");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("진행중");
  const [due, setDue] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    const ok = await send({ action: "project.create", emoji, title, desc, status, due, members });
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <div className="card mt">
      <h2 style={{ margin: "0 0 8px" }}>새 프로젝트</h2>
      <div className="grid cols-3">
        <label className="field" style={{ maxWidth: 90 }}>
          <span className="cap">아이콘</span>
          <input value={emoji} onChange={(e) => setEmoji(e.target.value)} style={{ textAlign: "center" }} />
        </label>
        <label className="field">
          <span className="cap">이름</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 가을 신메뉴 출시" />
        </label>
        <label className="field">
          <span className="cap">마감일</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      </div>
      <label className="field mt-s">
        <span className="cap">설명</span>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="한 줄로 무엇을 하는 일인지" />
      </label>
      <div className="row mt-s" style={{ gap: 8, flexWrap: "wrap" }}>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`btn sm ${status === s ? "" : "ghost"}`}
            onClick={() => setStatus(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <p className="cap mt-s">참여자</p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {people.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`btn sm ${members.includes(p.id) ? "" : "ghost"}`}
            onClick={() =>
              setMembers((m) => (m.includes(p.id) ? m.filter((x) => x !== p.id) : [...m, p.id]))
            }
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="row mt" style={{ justifyContent: "flex-end", gap: 8 }}>
        <button className="btn ghost sm" onClick={onDone}>취소</button>
        <button className="btn sm" onClick={submit} disabled={busy || !title.trim()}>
          {busy ? "만드는 중…" : "만들기"}
        </button>
      </div>
    </div>
  );
}

/* ── 프로젝트 카드 ── */
function ProjectCard({
  p,
  me,
  isOwner,
  readOnly,
  people,
  nameOf,
  open,
  onToggle,
  send,
}: {
  p: Project;
  me: { id: string; name: string } | null;
  isOwner: boolean;
  readOnly: boolean;
  people: Person[];
  nameOf: (id: string) => string;
  open: boolean;
  onToggle: () => void;
  send: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [taskText, setTaskText] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [comment, setComment] = useState("");
  const pct = progressOf(p);
  const doneCount = p.tasks.filter((t) => t.done).length;
  const canDelete = !readOnly && me && (p.by.id === me.id || isOwner);

  async function addTask() {
    if (!taskText.trim()) return;
    const ok = await send({
      action: "task.add",
      projectId: p.id,
      text: taskText,
      assignee: taskAssignee,
      due: taskDue,
    });
    if (ok) {
      setTaskText("");
      setTaskDue("");
    }
  }

  return (
    <div className="card" style={{ background: "var(--bg-2)" }}>
      <div className="row spread" style={{ cursor: "pointer" }} onClick={onToggle}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
          <span style={{ fontSize: "1.6rem", lineHeight: 1 }}>{p.emoji}</span>
          <div style={{ minWidth: 0 }}>
            <strong>{p.title}</strong>
            {p.desc && <div className="muted small">{p.desc}</div>}
          </div>
        </div>
        <span className="pill" style={{ background: STATUS_COLOR[p.status], color: "#12100c", whiteSpace: "nowrap" }}>
          {p.status}
        </span>
      </div>

      <div className="mt-s">
        <div className="row spread small" style={{ marginBottom: 4 }}>
          <span className="muted">
            할일 {doneCount}/{p.tasks.length}
          </span>
          <span className="row" style={{ gap: 8 }}>
            <DueBadge due={p.due} done={p.status === "완료"} />
            <span className="muted">{pct}%</span>
          </span>
        </div>
        <Bar value={pct} color={STATUS_COLOR[p.status]} />
      </div>

      {p.members.length > 0 && (
        <div className="row mt-s" style={{ gap: 6, flexWrap: "wrap" }}>
          {p.members.map((m) => (
            <span key={m} className="pill small">{nameOf(m) || m}</span>
          ))}
        </div>
      )}

      {!open && (
        <button className="btn ghost sm mt-s" style={{ width: "100%" }} onClick={onToggle}>
          자세히
        </button>
      )}

      {open && (
        <div className="mt">
          {/* 상태 바꾸기 */}
          {!readOnly && (
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {STATUSES.map((s) => (
                <button
                  key={s}
                  className={`btn sm ${p.status === s ? "" : "ghost"}`}
                  onClick={() => send({ action: "project.update", projectId: p.id, status: s })}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* 할일 */}
          <p className="cap mt">할일</p>
          {p.tasks.length === 0 && <p className="muted small">아직 할일이 없습니다.</p>}
          {p.tasks.map((t) => (
            <div key={t.id} className="row spread" style={{ padding: "4px 0", gap: 8 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, cursor: readOnly ? "default" : "pointer" }}>
                <input
                  type="checkbox"
                  checked={t.done}
                  disabled={readOnly}
                  onChange={() => send({ action: "task.toggle", projectId: p.id, taskId: t.id })}
                />
                <span style={{ textDecoration: t.done ? "line-through" : "none", opacity: t.done ? 0.6 : 1 }}>
                  {t.text}
                  {t.assignee && <span className="muted small"> · {nameOf(t.assignee)}</span>}
                  {t.done && t.doneBy && <span className="muted small"> · {t.doneBy.name} 완료</span>}
                </span>
              </label>
              <span className="row" style={{ gap: 6 }}>
                <DueBadge due={t.due} done={t.done} />
                {!readOnly && (
                  <button
                    className="btn ghost sm"
                    onClick={() => send({ action: "task.delete", projectId: p.id, taskId: t.id })}
                  >
                    ×
                  </button>
                )}
              </span>
            </div>
          ))}

          {!readOnly && (
            <div className="row mt-s" style={{ gap: 6, flexWrap: "wrap" }}>
              <input
                value={taskText}
                onChange={(e) => setTaskText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask()}
                placeholder="할일 추가"
                style={{ flex: 1, minWidth: 140 }}
              />
              <select value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)}>
                <option value="">담당자</option>
                {people.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
              <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
              <button className="btn sm" onClick={addTask} disabled={!taskText.trim()}>추가</button>
            </div>
          )}

          {/* 이야기 */}
          <p className="cap mt">이야기</p>
          {p.comments.length === 0 && <p className="muted small">아직 없습니다.</p>}
          {p.comments.map((c) => (
            <div key={c.id} className="row spread" style={{ padding: "4px 0" }}>
              <span className="small">
                <strong>{c.by.name}</strong> {c.text}
              </span>
              <span className="row" style={{ gap: 6 }}>
                <span className="muted small">{timeAgo(c.at)}</span>
                {!readOnly && me && (c.by.id === me.id || isOwner) && (
                  <button
                    className="btn ghost sm"
                    onClick={() => send({ action: "comment.delete", projectId: p.id, commentId: c.id })}
                  >
                    ×
                  </button>
                )}
              </span>
            </div>
          ))}

          {!readOnly && (
            <div className="row mt-s" style={{ gap: 6 }}>
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && comment.trim()) {
                    const ok = await send({ action: "comment.add", projectId: p.id, text: comment });
                    if (ok) setComment("");
                  }
                }}
                placeholder="한 줄 남기기"
                style={{ flex: 1 }}
              />
              <button
                className="btn sm"
                disabled={!comment.trim()}
                onClick={async () => {
                  const ok = await send({ action: "comment.add", projectId: p.id, text: comment });
                  if (ok) setComment("");
                }}
              >
                남기기
              </button>
            </div>
          )}

          <div className="row spread mt">
            <span className="muted small">{p.by.name}이(가) 만듦 · {timeAgo(p.updatedAt)} 수정</span>
            {canDelete && (
              <button
                className="btn ghost sm"
                onClick={() => {
                  if (confirm(`"${p.title}" 프로젝트를 지울까요? 할일과 기록도 같이 사라집니다.`)) {
                    send({ action: "project.delete", projectId: p.id });
                  }
                }}
              >
                프로젝트 삭제
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
