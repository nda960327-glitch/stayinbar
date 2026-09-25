// 오늘 한 일 메모 저장소 (/api/worklog)
// 구글시트 업무일지와 별개로, 앱에서 바로 남기는 "오늘 특별히 한 일" 한 토막입니다.
// 운영(Vercel): Upstash Redis · 개발(로컬 PC): data/worklog.json

import { promises as fs } from "fs";
import path from "path";
import { redis, hasRedis } from "./guestbook";

export const KEY = "stayin.worklog.v1";
const FILE_PATH = path.join(process.cwd(), "data", "worklog.json");
const KEEP = 1000;

export interface Note {
  id: string;
  date: string; // YYYY-MM-DD (일한 날)
  empId: string;
  name: string;
  text: string;
  at: number;
  updatedAt: number;
}

export interface Doc {
  notes: Note[];
}

export const EMPTY: Doc = { notes: [] };

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
  // 오래된 것부터 잘라낸다 (최근 것 우선 보관)
  doc.notes = [...doc.notes].sort((a, b) => b.at - a.at).slice(0, KEEP);
  if (hasRedis()) {
    await redis(["SET", KEY, JSON.stringify(doc)]);
    return;
  }
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(doc), "utf-8");
}

// 서버가 어느 시간대에서 돌든 한국 날짜로 계산합니다.
export const todayKST = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

const dayBefore = (date: string) =>
  new Date(new Date(date + "T12:00:00Z").getTime() - 86400000).toISOString().slice(0, 10);

// 바는 새벽에 닫으므로, 퇴근 후 어제 날짜를 채우는 것까지 허용합니다.
export function canWrite(date: string): boolean {
  const today = todayKST();
  return date === today || date === dayBefore(today);
}
