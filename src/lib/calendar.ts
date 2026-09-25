// 함께 보는 달력 저장소 (/api/calendar)
// 직접 적는 일정만 여기 저장하고, 프로젝트·할일 마감과 업무일지는 각자의 저장소에서 읽어와 겹쳐 보여줍니다.
// 운영(Vercel): Upstash Redis · 개발(로컬 PC): data/calendar.json

import { promises as fs } from "fs";
import path from "path";
import { redis, hasRedis } from "./guestbook";

export const KEY = "stayin.calendar.v1";
const FILE_PATH = path.join(process.cwd(), "data", "calendar.json");

export type EventKind = "일정" | "휴무" | "발주" | "이벤트" | "점검";
export const KINDS: EventKind[] = ["일정", "이벤트", "발주", "점검", "휴무"];

export interface CalEvent {
  id: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD (하루짜리면 start와 같음)
  title: string;
  kind: EventKind;
  memo: string;
  by: { id: string; name: string };
  at: number;
}

export interface Doc {
  events: CalEvent[];
}

export const EMPTY: Doc = { events: [] };

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

// 그 달에 걸치는 일정인지 (며칠짜리 일정은 달을 넘어갈 수 있다)
export function inMonth(e: CalEvent, month: string): boolean {
  const first = `${month}-01`;
  const last = `${month}-31`;
  return e.end >= first && e.start <= last;
}
