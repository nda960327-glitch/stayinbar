import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { verifyLogin } from "@/lib/auth";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

// 단골 장부 공유 저장소.
// 운영(Vercel): Upstash Redis (Storage 탭에서 연결하면 환경변수가 생김)
// 개발(로컬 PC): data/guestbook.json 파일

const KEY = "stayin.guestbook.v1";

interface Tombstone {
  id: number;
  at: number;
}

// 손님 특성 기록. 누가 적었는지(by) 서버가 직접 새깁니다.
interface Note {
  id: number;
  cid: number;      // 손님 id
  text: string;
  by: { id: string; name: string };
  at: number;       // 작성 시각 (ms)
}

interface Doc {
  pins: { staff: string; owner: string } | null;
  customers: any[];
  events: any[];
  deleted: Tombstone[];
  notes: Note[];
}

const EMPTY: Doc = { pins: null, customers: [], events: [], deleted: [], notes: [] };

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const FILE_PATH = path.join(process.cwd(), "data", "guestbook.json");

const NOTE_MAX = 500;    // 한 건 글자 수
const NOTE_KEEP = 5000;  // 보관할 기록 수

async function redis(cmd: (string | number)[]): Promise<any> {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "저장소 오류");
  return json.result;
}

const hasRedis = () => Boolean(REDIS_URL && REDIS_TOKEN);

// 파일 저장이 되는 환경인지 (Vercel 서버리스는 안 됨)
async function fsWritable(): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
    await fs.writeFile(path.join(path.dirname(FILE_PATH), ".probe"), "ok", "utf-8");
    return true;
  } catch {
    return false;
  }
}

async function storeAvailable(): Promise<boolean> {
  if (hasRedis()) return true;
  return fsWritable();
}

async function loadDoc(): Promise<Doc> {
  try {
    if (hasRedis()) {
      const raw = await redis(["GET", KEY]);
      return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
    }
    const raw = await fs.readFile(FILE_PATH, "utf-8");
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY };
  }
}

async function saveDoc(doc: Doc): Promise<void> {
  if (hasRedis()) {
    await redis(["SET", KEY, JSON.stringify(doc)]);
    return;
  }
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(doc), "utf-8");
}

// PIN 무차별 대입 방지: 10분에 30회 실패 시 잠금
async function bumpFail(ip: string): Promise<number> {
  if (!hasRedis()) return 0;
  const k = `stayin.guestbook.fail.${ip}`;
  const n = Number(await redis(["INCR", k])) || 0;
  await redis(["EXPIRE", k, 600]);
  return n;
}
async function failCount(ip: string): Promise<number> {
  if (!hasRedis()) return 0;
  return Number(await redis(["GET", `stayin.guestbook.fail.${ip}`])) || 0;
}

// ── 병합: 손님은 id별로 최근 수정(u)이 이김, 삭제 표시(tombstone)가 더 최근이면 삭제 ──
function mergeCustomers(a: any[], b: any[], deleted: Tombstone[]): any[] {
  const map = new Map<number, any>();
  for (const c of [...a, ...b]) {
    if (!c || typeof c.id !== "number") continue;
    const prev = map.get(c.id);
    if (!prev || (c.u || 0) > (prev.u || 0)) map.set(c.id, c);
  }
  for (const d of deleted) {
    const c = map.get(d.id);
    if (c && (c.u || 0) <= d.at) map.delete(d.id);
  }
  return Array.from(map.values());
}

function mergeEvents(a: any[], b: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const e of [...a, ...b]) {
    if (!e) continue;
    const k = `${e.t}|${e.d}|${e.id}|${e.k ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

function mergeDeleted(a: Tombstone[], b: Tombstone[]): Tombstone[] {
  const map = new Map<number, Tombstone>();
  for (const d of [...a, ...b]) {
    if (!d || typeof d.id !== "number") continue;
    const prev = map.get(d.id);
    if (!prev || d.at > prev.at) map.set(d.id, d);
  }
  // 무한히 쌓이지 않게 최근 1000개만 유지
  return Array.from(map.values()).sort((x, y) => y.at - x.at).slice(0, 1000);
}

const pub = (doc: Doc) => ({
  customers: doc.customers,
  events: doc.events,
  deleted: doc.deleted,
  notes: doc.notes || [],
});
const validPin = (p: unknown) => typeof p === "string" && /^\d{4}$/.test(p);

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
  const configured = await storeAvailable();
  let hasPins = false;
  if (configured) {
    const doc = await loadDoc();
    hasPins = Boolean(doc.pins);
  }
  return NextResponse.json({ configured, hasPins, staff: await staffList() });
}

interface Who {
  role: "owner" | "staff";
  me: { id: string; name: string } | null; // 직원 로그인일 때만 이름이 남습니다
}

export async function POST(req: Request) {
  if (!(await storeAvailable())) {
    return NextResponse.json({ error: "저장소가 아직 연결되지 않았습니다." }, { status: 503 });
  }
  const ip = (req.headers.get("x-forwarded-for") || "?").split(",")[0].trim();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const action = body?.action;
  const doc = await loadDoc();

  // ── 처음 설정: 공용 PIN 두 개 등록 ──
  if (action === "setup") {
    if (doc.pins) {
      return NextResponse.json({ error: "이미 PIN이 설정되어 있습니다." }, { status: 409 });
    }
    const pins = body.pins;
    if (!validPin(pins?.staff) || !validPin(pins?.owner) || pins.staff === pins.owner) {
      return NextResponse.json({ error: "PIN은 서로 다른 숫자 4자리여야 합니다." }, { status: 400 });
    }
    doc.pins = { staff: pins.staff, owner: pins.owner };
    await saveDoc(doc);
    return NextResponse.json({ ok: true, role: "owner", me: null, ...pub(doc) });
  }

  // ── 이하 액션은 로그인 필요 ──
  if ((await failCount(ip)) > 30) {
    return NextResponse.json({ error: "시도가 너무 많습니다. 10분 후 다시 해주세요." }, { status: 429 });
  }

  const pin = typeof body?.pin === "string" ? body.pin : "";
  const empId = typeof body?.empId === "string" ? body.empId.trim() : "";
  let who: Who;

  if (empId) {
    // 직원 각자의 아이디 + 개인 PIN (누가 적었는지 남기려면 이 방식이어야 합니다)
    const session = await verifyLogin(empId, pin);
    if (!session) {
      await bumpFail(ip);
      return NextResponse.json({ error: "이름과 PIN을 확인해 주세요" }, { status: 403 });
    }
    who = {
      role: session.role === "owner" ? "owner" : "staff",
      me: { id: session.id, name: session.name },
    };
  } else {
    // 예전 방식: 장부 공용 PIN (이름이 남지 않아 특성 기록은 할 수 없습니다)
    if (!doc.pins) {
      return NextResponse.json({ error: "setup-required" }, { status: 428 });
    }
    const role = pin === doc.pins.owner ? "owner" : pin === doc.pins.staff ? "staff" : null;
    if (!role) {
      await bumpFail(ip);
      return NextResponse.json({ error: "PIN이 맞지 않습니다" }, { status: 403 });
    }
    who = { role, me: null };
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

  if (action === "setpins") {
    if (who.role !== "owner") {
      return NextResponse.json({ error: "사장님만 바꿀 수 있습니다." }, { status: 403 });
    }
    const pins = body.pins;
    if (!validPin(pins?.staff) || !validPin(pins?.owner) || pins.staff === pins.owner) {
      return NextResponse.json({ error: "PIN은 서로 다른 숫자 4자리여야 합니다." }, { status: 400 });
    }
    doc.pins = { staff: pins.staff, owner: pins.owner };
    await saveDoc(doc);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "알 수 없는 요청" }, { status: 400 });
}
