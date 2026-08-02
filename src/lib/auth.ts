import { cookies } from "next/headers";
import { getConfig } from "./config";
import type { Role } from "./types";

export interface Session {
  id: string;
  name: string;
  role: Role;
}

const COOKIE = "sib_session";

export function encodeSession(s: Session): string {
  return Buffer.from(JSON.stringify(s)).toString("base64");
}

export function decodeSession(value: string): Session | null {
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf-8")) as Session;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  const c = cookies().get(COOKIE);
  if (!c) return null;
  return decodeSession(c.value);
}

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
