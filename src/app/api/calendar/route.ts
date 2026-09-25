import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { loadDoc as loadProjects } from "@/lib/projects";
import { loadDoc as loadWorklog, todayKST } from "@/lib/worklog";
import { KINDS, inMonth, loadDoc, saveDoc, type CalEvent, type EventKind } from "@/lib/calendar";

export const dynamic = "force-dynamic";

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMonth = (v: string) => /^\d{4}-\d{2}$/.test(v);
const clean = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

async function who() {
  const session = getSession();
  if (!session) return null;
  if (session.role === "exec") {
    return { me: { id: "exec", name: "임원" }, readOnly: true, isOwner: false };
  }
  const config = await getConfig();
  const emp = config.employees.find((e) => e.id === session.id);
  if (!emp) return null;
  if (emp.retiredAt && emp.retiredAt <= todayKST()) return null;
  return { me: { id: emp.id, name: emp.name }, readOnly: false, isOwner: emp.role === "owner" };
}

export async function GET(req: Request) {
  const w = await who();
  if (!w) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const qs = searchParams.get("month") ?? "";
  const month = isMonth(qs) ? qs : todayKST().slice(0, 7);

  const [cal, projectsDoc, worklogDoc, config] = await Promise.all([
    loadDoc(),
    loadProjects(),
    loadWorklog(),
    getConfig(),
  ]);

  const nameOf = (id: string) => config.employees.find((e) => e.id === id)?.name ?? "";

  // 프로젝트 마감 · 할일 마감을 달력에 겹쳐 보여줍니다
  const deadlines: {
    date: string;
    kind: "project" | "task";
    title: string;
    who: string;
    done: boolean;
    projectId: string;
  }[] = [];

  for (const p of projectsDoc.projects) {
    if (p.due && p.due.startsWith(month)) {
      deadlines.push({
        date: p.due,
        kind: "project",
        title: `${p.emoji} ${p.title}`,
        who: p.members.map(nameOf).filter(Boolean).join(", "),
        done: p.status === "완료",
        projectId: p.id,
      });
    }
    for (const t of p.tasks) {
      if (t.due && t.due.startsWith(month)) {
        deadlines.push({
          date: t.due,
          kind: "task",
          title: t.text,
          who: nameOf(t.assignee),
          done: t.done,
          projectId: p.id,
        });
      }
    }
  }

  // 그 달에 업무일지를 남긴 날 (누가 썼는지)
  const logDays: Record<string, string[]> = {};
  for (const n of worklogDoc.notes) {
    if (!n.date.startsWith(month)) continue;
    logDays[n.date] = [...(logDays[n.date] ?? []), n.name];
  }

  return NextResponse.json({
    month,
    me: w.me,
    readOnly: w.readOnly,
    isOwner: w.isOwner,
    events: cal.events.filter((e) => inMonth(e, month)),
    deadlines,
    logDays,
  });
}

export async function POST(req: Request) {
  const w = await who();
  if (!w) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (w.readOnly) return NextResponse.json({ error: "임원 계정은 보기만 됩니다." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  const doc = await loadDoc();

  if (action === "event.add") {
    const start = clean(body?.start, 10);
    if (!isDate(start)) return NextResponse.json({ error: "날짜를 골라주세요." }, { status: 400 });
    const title = clean(body?.title, 80);
    if (!title) return NextResponse.json({ error: "내용을 적어주세요." }, { status: 400 });
    let end = clean(body?.end, 10);
    if (!isDate(end) || end < start) end = start;
    const kind = KINDS.includes(body?.kind) ? (body.kind as EventKind) : "일정";
    const ev: CalEvent = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      start,
      end,
      title,
      kind,
      memo: clean(body?.memo, 500),
      by: w.me,
      at: Date.now(),
    };
    doc.events.push(ev);
  } else if (action === "event.delete") {
    const id = clean(body?.id, 40);
    const ev = doc.events.find((e) => e.id === id);
    if (!ev) return NextResponse.json({ error: "없는 일정입니다." }, { status: 404 });
    // 적은 사람과 사장만 지울 수 있습니다
    if (ev.by.id !== w.me.id && !w.isOwner) {
      return NextResponse.json({ error: "적은 사람과 사장만 지울 수 있습니다." }, { status: 403 });
    }
    doc.events = doc.events.filter((e) => e.id !== id);
  } else {
    return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
  }

  try {
    await saveDoc(doc);
  } catch (e) {
    return NextResponse.json({ error: `저장 실패: ${(e as Error).message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
