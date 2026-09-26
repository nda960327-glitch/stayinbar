// 쪽지함 저장소 (/api/notes)
// 직원끼리 주고받는 쪽지 + 할일 배정 같은 자동 알림이 함께 쌓입니다.
// 운영(Vercel): Upstash Redis · 개발(로컬 PC): data/notes.json

import { promises as fs } from "fs";
import path from "path";
import { redis, hasRedis } from "./guestbook";

export const KEY = "stayin.notes.v1";
const FILE_PATH = path.join(process.cwd(), "data", "notes.json");
const KEEP = 500; // 오래된 것부터 정리

export const ALL = "__all__"; // 전체 발송

export interface Note {
  id: string;
  threadId: string; // 답장끼리 묶는 값 (첫 쪽지의 id)
  subject: string;
  body: string;
  from: { id: string; name: string };
  to: string[]; // 직원 id 목록 또는 [ALL]
  auto?: boolean; // 시스템이 보낸 알림
  link?: string; // 눌렀을 때 갈 곳 (예: /projects)
  at: number;
  readBy: string[];
  starredBy: string[];
  trashedBy: string[];
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
  doc.notes = [...doc.notes].sort((a, b) => b.at - a.at).slice(0, KEEP);
  if (hasRedis()) {
    await redis(["SET", KEY, JSON.stringify(doc)]);
    return;
  }
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(doc), "utf-8");
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// 나에게 온 쪽지인가 (전체 발송 포함)
export const isForMe = (n: Note, myId: string) => n.to.includes(ALL) || n.to.includes(myId);

// 내 쪽지함에 보일 것인가 (내가 보낸 것도 보임)
export const isVisible = (n: Note, myId: string) => isForMe(n, myId) || n.from.id === myId;

export const unreadCount = (doc: Doc, myId: string) =>
  doc.notes.filter(
    (n) => isForMe(n, myId) && n.from.id !== myId && !n.readBy.includes(myId) && !n.trashedBy.includes(myId)
  ).length;

// 시스템 알림 보내기 (할일 배정 등). 저장까지 해준다.
export async function sendAuto(opts: {
  to: string[];
  from: { id: string; name: string };
  subject: string;
  body: string;
  link?: string;
}): Promise<void> {
  const targets = opts.to.filter((t) => t && t !== opts.from.id);
  if (targets.length === 0) return; // 나에게 보내는 알림은 만들지 않는다
  const doc = await loadDoc();
  const id = newId();
  doc.notes.push({
    id,
    threadId: id,
    subject: opts.subject,
    body: opts.body,
    from: opts.from,
    to: targets,
    auto: true,
    link: opts.link,
    at: Date.now(),
    readBy: [],
    starredBy: [],
    trashedBy: [],
  });
  await saveDoc(doc);
}
