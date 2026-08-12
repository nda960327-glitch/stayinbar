// 단골 장부 공유 저장소 (직원용 /api/guestbook, 손님용 /api/join 이 함께 씁니다)
// 운영(Vercel): Upstash Redis · 개발(로컬 PC): data/guestbook.json

import { promises as fs } from "fs";
import path from "path";

export const KEY = "stayin.guestbook.v1";

export interface Tombstone {
  id: number;
  at: number;
}

// 손님 특성 기록. 누가 적었는지(by)는 서버가 직접 새깁니다.
export interface Note {
  id: number;
  cid: number;
  text: string;
  by: { id: string; name: string };
  at: number;
}

export interface Doc {
  pins: { staff: string; owner: string } | null;
  customers: any[];
  events: any[];
  deleted: Tombstone[];
  notes: Note[];
}

export const EMPTY: Doc = { pins: null, customers: [], events: [], deleted: [], notes: [] };

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const FILE_PATH = path.join(process.cwd(), "data", "guestbook.json");

export async function redis(cmd: (string | number)[]): Promise<any> {
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

export const hasRedis = () => Boolean(REDIS_URL && REDIS_TOKEN);

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

export async function storeAvailable(): Promise<boolean> {
  if (hasRedis()) return true;
  return fsWritable();
}

export async function loadDoc(): Promise<Doc> {
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

export async function saveDoc(doc: Doc): Promise<void> {
  if (hasRedis()) {
    await redis(["SET", KEY, JSON.stringify(doc)]);
    return;
  }
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(doc), "utf-8");
}

// ── 횟수 제한 (Redis가 있을 때만 동작) ──
export async function bumpCounter(key: string, ttlSec: number): Promise<number> {
  if (!hasRedis()) return 0;
  const n = Number(await redis(["INCR", key])) || 0;
  await redis(["EXPIRE", key, ttlSec]);
  return n;
}
export async function readCounter(key: string): Promise<number> {
  if (!hasRedis()) return 0;
  return Number(await redis(["GET", key])) || 0;
}

// ── 병합: 손님은 id별로 최근 수정(u)이 이김, 삭제 표시(tombstone)가 더 최근이면 삭제 ──
export function mergeCustomers(a: any[], b: any[], deleted: Tombstone[]): any[] {
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

export function mergeEvents(a: any[], b: any[]): any[] {
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

export function mergeDeleted(a: Tombstone[], b: Tombstone[]): Tombstone[] {
  const map = new Map<number, Tombstone>();
  for (const d of [...a, ...b]) {
    if (!d || typeof d.id !== "number") continue;
    const prev = map.get(d.id);
    if (!prev || d.at > prev.at) map.set(d.id, d);
  }
  // 무한히 쌓이지 않게 최근 1000개만 유지
  return Array.from(map.values()).sort((x, y) => y.at - x.at).slice(0, 1000);
}

// ── 공용 도우미 ──
export const todayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const eventKey = () => Math.random().toString(36).slice(2, 8);

export const clientIp = (req: Request) =>
  (req.headers.get("x-forwarded-for") || "?").split(",")[0].trim();
