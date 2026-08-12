import { NextResponse } from "next/server";
import { verifyLogin, getSession } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import {
  Doc,
  Note,
  bumpCounter,
  clientIp,
  loadDoc,
  mergeCustomers,
  mergeDeleted,
  mergeEvents,
  readCounter,
  saveDoc,
  storeAvailable,
} from "@/lib/guestbook";

export const dynamic = "force-dynamic";

const NOTE_MAX = 500;    // 한 건 글자 수
const NOTE_KEEP = 5000;  // 보관할 기록 수

// PIN 무차별 대입 방지: 10분에 30회 실패 시 잠금
const failKey = (ip: string) => `stayin.guestbook.fail.${ip}`;
const bumpFail = (ip: string) => bumpCounter(failKey(ip), 600);
const failCount = (ip: string) => readCounter(failKey(ip));

const pub = (doc: Doc) => ({
  customers: doc.customers,
  events: doc.events,
  deleted: doc.deleted,
  notes: doc.notes || [],
});

// 직원 명단 (PIN 등 민감정보 제외). 잠금 화면의 이름 고르기에 씁니다.
async function staffList(): Promise<{ id: string; name: string; position: string; owner: boolean }[]> {
  try {
    const config = await getConfig();
    return config.employees
      .filter((e) => e.pin)
      .map((e) => ({ id: e.id, name: e.name, position: e.position, owner: e.role === "owner" }));
  } catch {
    return [];
  }
}

export async function GET() {
  // 앱에 이미 로그인해 있으면 장부는 따로 로그인할 필요가 없습니다
  const session = getSession();
  return NextResponse.json({
    configured: await storeAvailable(),
    staff: await staffList(),
    session: session ? { id: session.id, name: session.name } : null,
  });
}

interface Who {
  role: "owner" | "staff";
  me: { id: string; name: string } | null; // 이름이 확인된 로그인일 때만
}

export async function POST(req: Request) {
  if (!(await storeAvailable())) {
    return NextResponse.json({ error: "저장소가 아직 연결되지 않았습니다." }, { status: 503 });
  }
  const ip = clientIp(req);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const action = body?.action;
  const doc = await loadDoc();

  if ((await failCount(ip)) > 30) {
    return NextResponse.json({ error: "시도가 너무 많습니다. 10분 후 다시 해주세요." }, { status: 429 });
  }

  // ── 로그인: 반드시 본인 이름으로 (누가 무엇을 했는지 남기기 위해) ──
  const pin = typeof body?.pin === "string" ? body.pin : "";
  const empId = typeof body?.empId === "string" ? body.empId.trim() : "";
  let who: Who;

  if (body?.useSession === true) {
    // 앱(/me · /owner)에 로그인한 쿠키를 그대로 씁니다 — 두 번 로그인하지 않도록
    const session = getSession();
    const emp = session ? (await getConfig()).employees.find((e) => e.id === session.id) : null;
    if (!emp) {
      return NextResponse.json({ error: "앱 로그인이 만료되었습니다." }, { status: 401 });
    }
    who = { role: emp.role === "owner" ? "owner" : "staff", me: { id: emp.id, name: emp.name } };
  } else {
    const session = empId ? await verifyLogin(empId, pin) : null;
    if (!session) {
      await bumpFail(ip);
      return NextResponse.json({ error: "이름과 PIN을 확인해 주세요" }, { status: 403 });
    }
    who = {
      role: session.role === "owner" ? "owner" : "staff",
      me: { id: session.id, name: session.name },
    };
  }

  if (action === "load") {
    return NextResponse.json({ ...who, ...pub(doc) });
  }

  if (action === "save") {
    const deleted = mergeDeleted(doc.deleted, Array.isArray(body.deleted) ? body.deleted : []);
    const customers = mergeCustomers(
      doc.customers,
      Array.isArray(body.customers) ? body.customers : [],
      deleted
    );
    const events = mergeEvents(doc.events, Array.isArray(body.events) ? body.events : []);
    const next: Doc = { pins: doc.pins, customers, events, deleted, notes: doc.notes || [] };
    await saveDoc(next);
    return NextResponse.json({ ...who, ...pub(next) });
  }

  // ── 손님 특성 기록 남기기 ──
  if (action === "note") {
    if (!who.me) {
      return NextResponse.json(
        { error: "특성 기록은 본인 이름으로 로그인해야 남길 수 있습니다." },
        { status: 403 }
      );
    }
    const cid = Number(body.cid);
    const text = String(body.text ?? "").trim();
    if (!Number.isFinite(cid) || !doc.customers.some((c) => c && c.id === cid)) {
      return NextResponse.json({ error: "손님을 찾을 수 없습니다." }, { status: 404 });
    }
    if (!text) {
      return NextResponse.json({ error: "내용을 적어주세요." }, { status: 400 });
    }
    const note: Note = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      cid,
      text: text.slice(0, NOTE_MAX),
      by: who.me,
      at: Date.now(),
    };
    const notes = [...(doc.notes || []), note]
      .sort((a, b) => b.at - a.at)
      .slice(0, NOTE_KEEP);
    await saveDoc({ ...doc, notes });
    return NextResponse.json({ ...who, ...pub({ ...doc, notes }) });
  }

  // ── 기록 지우기: 본인이 쓴 것 또는 사장 ──
  if (action === "note-del") {
    const noteId = Number(body.noteId);
    const target = (doc.notes || []).find((n) => n.id === noteId);
    if (!target) {
      return NextResponse.json({ error: "기록을 찾을 수 없습니다." }, { status: 404 });
    }
    const mine = who.me && target.by?.id === who.me.id;
    if (!mine && who.role !== "owner") {
      return NextResponse.json({ error: "본인이 쓴 기록만 지울 수 있습니다." }, { status: 403 });
    }
    const notes = (doc.notes || []).filter((n) => n.id !== noteId);
    await saveDoc({ ...doc, notes });
    return NextResponse.json({ ...who, ...pub({ ...doc, notes }) });
  }

  return NextResponse.json({ error: "알 수 없는 요청" }, { status: 400 });
}
