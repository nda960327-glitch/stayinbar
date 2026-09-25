// 함께 쓰는 프로젝트 보드 저장소 (/api/projects)
// 운영(Vercel): Upstash Redis · 개발(로컬 PC): data/projects.json
// 여러 명이 동시에 고치므로, 수정은 항상 서버에서 "불러오기 → 고치기 → 저장하기"로 한 번에 처리합니다.

import { promises as fs } from "fs";
import path from "path";
import { redis, hasRedis } from "./guestbook";

export const KEY = "stayin.projects.v1";
const FILE_PATH = path.join(process.cwd(), "data", "projects.json");

export type ProjectStatus = "예정" | "진행중" | "보류" | "완료";
export const STATUSES: ProjectStatus[] = ["진행중", "예정", "보류", "완료"];

export interface Who {
  id: string;
  name: string;
}

export interface Task {
  id: string;
  text: string;
  assignee: string; // 직원 id ("" 면 담당자 없음)
  due: string; // YYYY-MM-DD ("" 면 기한 없음)
  done: boolean;
  doneBy?: Who;
  doneAt?: number;
  by: Who;
  at: number;
}

export interface Comment {
  id: string;
  text: string;
  by: Who;
  at: number;
}

export interface Project {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  status: ProjectStatus;
  members: string[]; // 직원 id
  due: string;
  tasks: Task[];
  comments: Comment[];
  by: Who;
  at: number;
  updatedAt: number;
}

export interface Activity {
  id: string;
  text: string;
  projectId: string;
  by: Who;
  at: number;
}

export interface Doc {
  projects: Project[];
  activity: Activity[];
}

export const EMPTY: Doc = { projects: [], activity: [] };
const ACTIVITY_KEEP = 100;

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

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

// 누가 무엇을 했는지 남긴다 (보드 아래 "최근 활동"에 보임)
export function logActivity(doc: Doc, by: Who, projectId: string, text: string): void {
  doc.activity.unshift({ id: newId(), text, projectId, by, at: Date.now() });
  doc.activity = doc.activity.slice(0, ACTIVITY_KEEP);
}

export const findProject = (doc: Doc, id: string) => doc.projects.find((p) => p.id === id);

// 진행률: 할일 완료 비율. 할일이 없으면 상태가 "완료"일 때만 100%.
export function progressOf(p: Project): number {
  if (p.tasks.length === 0) return p.status === "완료" ? 100 : 0;
  return Math.round((p.tasks.filter((t) => t.done).length / p.tasks.length) * 100);
}
