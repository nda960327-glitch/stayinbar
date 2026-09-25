import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { getLogs } from "@/lib/store";
import { matchEmployee } from "@/lib/calc";
import { loadDoc, saveDoc, canWrite, todayKST, type Note } from "@/lib/worklog";

export const dynamic = "force-dynamic";

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

async function who() {
  const session = getSession();
  if (!session) return null;
  if (session.role === "exec") {
    return { me: { id: "exec", name: "임원" }, readOnly: true };
  }
  const config = await getConfig();
  const emp = config.employees.find((e) => e.id === session.id);
  if (!emp) return null;
  if (emp.retiredAt && emp.retiredAt <= todayKST()) return null;
  return { me: { id: emp.id, name: emp.name }, readOnly: false };
}

export async function GET(req: Request) {
  const w = await who();
  if (!w) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const qs = searchParams.get("date") ?? "";
  const date = isDate(qs) ? qs : todayKST();

  const config = await getConfig();
  const doc = await loadDoc();
  const notes = doc.notes.filter((n) => n.date === date);

  // 구글시트 업무일지에서 그 날 기록을 사람별로 모은다
  const { rows } = await getLogs();
  const sheetByEmp = new Map<string, { label: string; text: string }[]>();
  let sheetUnmatched = 0;
  for (const r of rows) {
    if (r.date !== date) continue;
    const emp = matchEmployee(r.name, config.employees);
    if (!emp) {
      if (r.name) sheetUnmatched += 1;
      continue;
    }
    const items = Object.entries(r.texts)
      .filter(([, v]) => String(v ?? "").trim().length > 1)
      .map(([label, text]) => ({ label, text: String(text).trim() }));
    if (items.length === 0) continue;
    sheetByEmp.set(emp.id, [...(sheetByEmp.get(emp.id) ?? []), ...items]);
  }

  const people = config.employees
    .filter((e) => !e.retiredAt || e.retiredAt > todayKST())
    .map((e) => ({
      id: e.id,
      name: e.name,
      position: e.position,
      note: notes.find((n) => n.empId === e.id) ?? null,
      sheet: sheetByEmp.get(e.id) ?? [],
    }));

  return NextResponse.json({
    date,
    me: w.me,
    readOnly: w.readOnly,
    canWrite: !w.readOnly && canWrite(date),
    people,
    sheetUnmatched,
  });
}

// 본인 것만, 오늘과 어제만 쓸 수 있습니다.
export async function POST(req: Request) {
  const w = await who();
  if (!w) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (w.readOnly) return NextResponse.json({ error: "임원 계정은 보기만 됩니다." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const date = isDate(String(body?.date ?? "")) ? String(body.date) : todayKST();
  if (!canWrite(date)) {
    return NextResponse.json({ error: "오늘과 어제 것만 쓸 수 있습니다." }, { status: 400 });
  }
  const text = String(body?.text ?? "").trim().slice(0, 1000);

  const doc = await loadDoc();
  const idx = doc.notes.findIndex((n) => n.date === date && n.empId === w.me.id);

  if (!text) {
    // 내용을 비우면 지웁니다
    if (idx >= 0) doc.notes.splice(idx, 1);
  } else if (idx >= 0) {
    doc.notes[idx].text = text;
    doc.notes[idx].name = w.me.name;
    doc.notes[idx].updatedAt = Date.now();
  } else {
    const note: Note = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      date,
      empId: w.me.id,
      name: w.me.name,
      text,
      at: Date.now(),
      updatedAt: Date.now(),
    };
    doc.notes.push(note);
  }

  try {
    await saveDoc(doc);
  } catch (e) {
    return NextResponse.json({ error: `저장 실패: ${(e as Error).message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
