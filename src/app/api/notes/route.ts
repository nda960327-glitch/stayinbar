import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { todayKST } from "@/lib/worklog";
import {
  ALL,
  isVisible,
  loadDoc,
  newId,
  saveDoc,
  unreadCount,
  type Note,
} from "@/lib/notes";

export const dynamic = "force-dynamic";

const clean = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

async function who() {
  const session = getSession();
  if (!session) return null;
  // 임원 계정은 사람이 아니라 열람용이라 쪽지함을 쓰지 않습니다.
  if (session.role === "exec") return null;
  const config = await getConfig();
  const emp = config.employees.find((e) => e.id === session.id);
  if (!emp) return null;
  if (emp.retiredAt && emp.retiredAt <= todayKST()) return null;
  return { me: { id: emp.id, name: emp.name }, isOwner: emp.role === "owner" };
}

export async function GET() {
  const w = await who();
  if (!w) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const config = await getConfig();
  const doc = await loadDoc();
  const today = todayKST();

  return NextResponse.json({
    me: w.me,
    notes: doc.notes.filter((n) => isVisible(n, w.me.id)),
    unread: unreadCount(doc, w.me.id),
    people: config.employees
      .filter((e) => (!e.retiredAt || e.retiredAt > today) && e.id !== w.me.id)
      .map((e) => ({ id: e.id, name: e.name, position: e.position })),
  });
}

export async function POST(req: Request) {
  const w = await who();
  if (!w) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const to: string[] = Array.isArray(body?.to) ? body.to.map((t: unknown) => clean(t, 40)) : [];
  const text = clean(body?.body, 2000);
  if (to.length === 0) return NextResponse.json({ error: "받는 사람을 골라주세요." }, { status: 400 });
  if (!text) return NextResponse.json({ error: "내용을 적어주세요." }, { status: 400 });

  const doc = await loadDoc();
  const replyTo = clean(body?.threadId, 40);
  // 답장은 내가 볼 수 있는 대화에만 붙일 수 있습니다
  if (replyTo && !doc.notes.some((n) => n.threadId === replyTo && isVisible(n, w.me.id))) {
    return NextResponse.json({ error: "답장할 수 없는 쪽지입니다." }, { status: 403 });
  }

  const id = newId();
  const note: Note = {
    id,
    threadId: replyTo || id,
    subject: clean(body?.subject, 80) || (replyTo ? "답장" : "쪽지"),
    body: text,
    from: w.me,
    to,
    at: Date.now(),
    readBy: [w.me.id],
    starredBy: [],
    trashedBy: [],
  };
  doc.notes.push(note);

  try {
    await saveDoc(doc);
  } catch (e) {
    return NextResponse.json({ error: `저장 실패: ${(e as Error).message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, notes: doc.notes.filter((n) => isVisible(n, w.me.id)) });
}

// 읽음·중요·휴지통 표시
export async function PATCH(req: Request) {
  const w = await who();
  if (!w) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map((i: unknown) => clean(i, 40)) : [];
  const doc = await loadDoc();
  const me = w.me.id;

  const toggle = (arr: string[], on: boolean) =>
    on ? Array.from(new Set([...arr, me])) : arr.filter((x) => x !== me);

  for (const n of doc.notes) {
    if (!ids.includes(n.id) || !isVisible(n, me)) continue;
    switch (action) {
      case "read":
        n.readBy = toggle(n.readBy, true);
        break;
      case "unread":
        n.readBy = toggle(n.readBy, false);
        break;
      case "star":
        n.starredBy = toggle(n.starredBy, !n.starredBy.includes(me));
        break;
      case "trash":
        n.trashedBy = toggle(n.trashedBy, true);
        break;
      case "restore":
        n.trashedBy = toggle(n.trashedBy, false);
        break;
      default:
        return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
    }
  }

  // 완전 삭제는 내가 보낸 쪽지만 (사장은 전부)
  if (action === "purge") {
    doc.notes = doc.notes.filter((n) => !(ids.includes(n.id) && (n.from.id === me || w.isOwner)));
  }

  try {
    await saveDoc(doc);
  } catch (e) {
    return NextResponse.json({ error: `저장 실패: ${(e as Error).message}` }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    notes: doc.notes.filter((n) => isVisible(n, me)),
    unread: unreadCount(doc, me),
  });
}
