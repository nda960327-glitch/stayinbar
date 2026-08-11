import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

// 단골 장부 공유 저장소.
// 운영(Vercel): Upstash Redis (Storage 탭에서 연결하면 환경변수가 생김)
// 개발(로컬 PC): data/guestbook.json 파일

const KEY = "stayin.guestbook.v1";

interface Tombstone {
  id: number;
  at: number;
}

interface Doc {
  pins: { staff: string; owner: string } | null;
  customers: any[];
  events: any[];
  deleted: Tombstone[];
}

const EMPTY: Doc = { pins: null, customers: [], events: [], deleted: [] };

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const FILE_PATH = path.join(process.cwd(), "data", "guestbook.json");

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

const pub = (doc: Doc) => ({ customers: doc.customers, events: doc.events, deleted: doc.deleted });
const validPin = (p: unknown) => typeof p === "string" && /^\d{4}$/.test(p);

export async function GET() {
  const configured = await storeAvailable();
  let hasPins = false;
  if (configured) {
    const doc = await loadDoc();
    hasPins = Boolean(doc.pins);
  }
  return NextResponse.json({ configured, hasPins });
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

  // ── 처음 설정: PIN 두 개 등록 ──
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
    return NextResponse.json({ ok: true, role: "owner", ...pub(doc) });
  }

  // ── 이하 액션은 PIN 필요 ──
  if (!doc.pins) {
    return NextResponse.json({ error: "setup-required" }, { status: 428 });
  }
  if ((await failCount(ip)) > 30) {
    return NextResponse.json({ error: "시도가 너무 많습니다. 10분 후 다시 해주세요." }, { status: 429 });
  }
  const pin = body?.pin;
  const role = pin === doc.pins.owner ? "owner" : pin === doc.pins.staff ? "staff" : null;
  if (!role) {
    await bumpFail(ip);
    return NextResponse.json({ error: "PIN이 맞지 않습니다" }, { status: 403 });
  }

  if (action === "load") {
    return NextResponse.json({ role, ...pub(doc) });
  }

  if (action === "save") {
    const deleted = mergeDeleted(doc.deleted, Array.isArray(body.deleted) ? body.deleted : []);
    const customers = mergeCustomers(
      doc.customers,
      Array.isArray(body.customers) ? body.customers : [],
      deleted
    );
    const events = mergeEvents(doc.events, Array.isArray(body.events) ? body.events : []);
    const next: Doc = { pins: doc.pins, customers, events, deleted };
    await saveDoc(next);
    return NextResponse.json({ role, ...pub(next) });
  }

  if (action === "setpins") {
    if (role !== "owner") {
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
