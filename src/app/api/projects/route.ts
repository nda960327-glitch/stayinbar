import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import {
  loadDoc,
  saveDoc,
  findProject,
  logActivity,
  newId,
  STATUSES,
  type Doc,
  type Project,
  type ProjectStatus,
  type Who,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

const TEXT_MAX = 2000;
const clean = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

// 로그인한 사람만. 임원(exec) PIN으로 들어온 사람은 보기만 됩니다.
async function who(): Promise<{ me: Who; readOnly: boolean; isOwner: boolean } | null> {
  const session = getSession();
  if (!session) return null;
  if (session.role === "exec") {
    return { me: { id: "exec", name: "임원" }, readOnly: true, isOwner: false };
  }
  const config = await getConfig();
  const emp = config.employees.find((e) => e.id === session.id);
  if (!emp) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (emp.retiredAt && emp.retiredAt <= today) return null; // 퇴사자
  return { me: { id: emp.id, name: emp.name }, readOnly: false, isOwner: emp.role === "owner" };
}

export async function GET() {
  const w = await who();
  if (!w) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const config = await getConfig();
  const today = new Date().toISOString().slice(0, 10);
  const doc = await loadDoc();
  return NextResponse.json({
    ...doc,
    me: w.me,
    readOnly: w.readOnly,
    isOwner: w.isOwner,
    // 담당자 고르기 목록 (재직 중인 사람만)
    people: config.employees
      .filter((e) => !e.retiredAt || e.retiredAt > today)
      .map((e) => ({ id: e.id, name: e.name, position: e.position })),
  });
}

export async function POST(req: Request) {
  const w = await who();
  if (!w) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (w.readOnly) {
    return NextResponse.json({ error: "임원 계정은 보기만 됩니다." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  const me = w.me;
  const doc: Doc = await loadDoc();

  const need = (p: Project | undefined): p is Project => !!p;
  const target = findProject(doc, clean(body?.projectId, 40));

  switch (action) {
    case "project.create": {
      const title = clean(body?.title, 80);
      if (!title) return NextResponse.json({ error: "이름을 적어주세요." }, { status: 400 });
      const p: Project = {
        id: newId(),
        emoji: clean(body?.emoji, 4) || "📌",
        title,
        desc: clean(body?.desc, 500),
        status: STATUSES.includes(body?.status) ? (body.status as ProjectStatus) : "진행중",
        members: Array.isArray(body?.members) ? body.members.map((m: unknown) => clean(m, 40)) : [],
        due: clean(body?.due, 10),
        tasks: [],
        comments: [],
        by: me,
        at: Date.now(),
        updatedAt: Date.now(),
      };
      doc.projects.unshift(p);
      logActivity(doc, me, p.id, `"${p.title}" 프로젝트를 만들었습니다`);
      break;
    }

    case "project.update": {
      if (!need(target)) return NextResponse.json({ error: "없는 프로젝트입니다." }, { status: 404 });
      const before = target.status;
      if (body?.title !== undefined) target.title = clean(body.title, 80) || target.title;
      if (body?.emoji !== undefined) target.emoji = clean(body.emoji, 4) || target.emoji;
      if (body?.desc !== undefined) target.desc = clean(body.desc, 500);
      if (body?.due !== undefined) target.due = clean(body.due, 10);
      if (body?.members !== undefined && Array.isArray(body.members)) {
        target.members = body.members.map((m: unknown) => clean(m, 40));
      }
      if (body?.status !== undefined && STATUSES.includes(body.status)) {
        target.status = body.status as ProjectStatus;
      }
      target.updatedAt = Date.now();
      logActivity(
        doc,
        me,
        target.id,
        before !== target.status
          ? `"${target.title}"을(를) ${target.status}(으)로 옮겼습니다`
          : `"${target.title}" 내용을 고쳤습니다`
      );
      break;
    }

    case "project.delete": {
      if (!need(target)) return NextResponse.json({ error: "없는 프로젝트입니다." }, { status: 404 });
      // 만든 사람과 사장만 지울 수 있습니다 (남의 작업이 통째로 사라지지 않도록)
      if (target.by.id !== me.id && !w.isOwner) {
        return NextResponse.json({ error: "만든 사람과 사장만 지울 수 있습니다." }, { status: 403 });
      }
      doc.projects = doc.projects.filter((p) => p.id !== target.id);
      logActivity(doc, me, target.id, `"${target.title}" 프로젝트를 지웠습니다`);
      break;
    }

    case "task.add": {
      if (!need(target)) return NextResponse.json({ error: "없는 프로젝트입니다." }, { status: 404 });
      const text = clean(body?.text, 200);
      if (!text) return NextResponse.json({ error: "할일 내용을 적어주세요." }, { status: 400 });
      target.tasks.push({
        id: newId(),
        text,
        assignee: clean(body?.assignee, 40),
        due: clean(body?.due, 10),
        done: false,
        by: me,
        at: Date.now(),
      });
      target.updatedAt = Date.now();
      logActivity(doc, me, target.id, `"${target.title}"에 할일을 추가했습니다: ${text}`);
      break;
    }

    case "task.toggle": {
      if (!need(target)) return NextResponse.json({ error: "없는 프로젝트입니다." }, { status: 404 });
      const task = target.tasks.find((t) => t.id === clean(body?.taskId, 40));
      if (!task) return NextResponse.json({ error: "없는 할일입니다." }, { status: 404 });
      task.done = !task.done;
      task.doneBy = task.done ? me : undefined;
      task.doneAt = task.done ? Date.now() : undefined;
      target.updatedAt = Date.now();
      logActivity(
        doc,
        me,
        target.id,
        task.done ? `할일을 끝냈습니다: ${task.text}` : `할일을 다시 열었습니다: ${task.text}`
      );
      break;
    }

    case "task.update": {
      if (!need(target)) return NextResponse.json({ error: "없는 프로젝트입니다." }, { status: 404 });
      const task = target.tasks.find((t) => t.id === clean(body?.taskId, 40));
      if (!task) return NextResponse.json({ error: "없는 할일입니다." }, { status: 404 });
      if (body?.assignee !== undefined) task.assignee = clean(body.assignee, 40);
      if (body?.due !== undefined) task.due = clean(body.due, 10);
      if (body?.text !== undefined) task.text = clean(body.text, 200) || task.text;
      target.updatedAt = Date.now();
      break;
    }

    case "task.delete": {
      if (!need(target)) return NextResponse.json({ error: "없는 프로젝트입니다." }, { status: 404 });
      const taskId = clean(body?.taskId, 40);
      const task = target.tasks.find((t) => t.id === taskId);
      if (!task) return NextResponse.json({ error: "없는 할일입니다." }, { status: 404 });
      target.tasks = target.tasks.filter((t) => t.id !== taskId);
      target.updatedAt = Date.now();
      logActivity(doc, me, target.id, `할일을 지웠습니다: ${task.text}`);
      break;
    }

    case "comment.add": {
      if (!need(target)) return NextResponse.json({ error: "없는 프로젝트입니다." }, { status: 404 });
      const text = clean(body?.text, TEXT_MAX);
      if (!text) return NextResponse.json({ error: "내용을 적어주세요." }, { status: 400 });
      target.comments.push({ id: newId(), text, by: me, at: Date.now() });
      target.updatedAt = Date.now();
      logActivity(doc, me, target.id, `"${target.title}"에 글을 남겼습니다`);
      break;
    }

    case "comment.delete": {
      if (!need(target)) return NextResponse.json({ error: "없는 프로젝트입니다." }, { status: 404 });
      const cid = clean(body?.commentId, 40);
      const c = target.comments.find((x) => x.id === cid);
      if (!c) return NextResponse.json({ error: "없는 글입니다." }, { status: 404 });
      if (c.by.id !== me.id && !w.isOwner) {
        return NextResponse.json({ error: "쓴 사람과 사장만 지울 수 있습니다." }, { status: 403 });
      }
      target.comments = target.comments.filter((x) => x.id !== cid);
      break;
    }

    default:
      return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
  }

  try {
    await saveDoc(doc);
  } catch (e) {
    return NextResponse.json({ error: `저장 실패: ${(e as Error).message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, projects: doc.projects, activity: doc.activity });
}
