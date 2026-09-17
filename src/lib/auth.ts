import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getConfig } from "./config";
import { bumpCounter, readCounter } from "./guestbook";
import type { Role } from "./types";

// "exec" = /exec PIN으로 들어온 임원: 대시보드 조회만 가능하고 설정·직원정보에는 접근 불가
export type SessionRole = Role | "exec";

export interface Session {
  id: string;
  name: string;
  role: SessionRole;
}

const COOKIE = "sib_session";
export const SESSION_MAX_AGE = 60 * 60 * 12;

// 쿠키 위조 방지용 서명 키. Vercel 환경변수 SESSION_SECRET 설정을 권장.
// 없으면 서버에만 있는 KV 토큰을 쓰고, 그것도 없으면(로컬 개발) 프로세스마다 임의 생성.
const SECRET =
  process.env.SESSION_SECRET ||
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  randomBytes(32).toString("hex");

const sign = (payload: string) => createHmac("sha256", SECRET).update(payload).digest("base64url");

export function encodeSession(s: Session): string {
  const payload = Buffer.from(
    JSON.stringify({ ...s, exp: Date.now() + SESSION_MAX_AGE * 1000 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(value: string): Session | null {
  try {
    const [payload, sig] = value.split(".");
    if (!payload || !sig) return null;
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return { id: data.id, name: data.name, role: data.role };
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  const c = cookies().get(COOKIE);
  if (!c) return null;
  return decodeSession(c.value);
}

// PIN 무차별 대입 방지: 같은 IP에서 10분에 10회 실패 시 잠금 (Redis 연결 시에만 동작)
const failKey = (scope: string, ip: string) => `stayin.auth.fail.${scope}.${ip}`;
export const loginLocked = async (scope: string, ip: string) =>
  (await readCounter(failKey(scope, ip))) >= 10;
export const recordLoginFail = (scope: string, ip: string) => bumpCounter(failKey(scope, ip), 600);

export async function verifyLogin(id: string, pin: string): Promise<Session | null> {
  const config = await getConfig();
  const emp = config.employees.find((e) => e.id === id);
  if (!emp) return null;
  if (emp.pin && emp.pin === pin) {
    return { id: emp.id, name: emp.name, role: emp.role };
  }
  return null;
}

export const SESSION_COOKIE = COOKIE;
