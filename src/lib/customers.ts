import { promises as fs } from "fs";
import path from "path";

// 손님 장부 한 명 분량
export interface Customer {
  id: number;
  name: string;
  tel: string; // 숫자만 저장
  co: string; // 회사 · 팀
  bm: number; // 생일 월 (0 = 미입력)
  bd: number; // 생일 일 (0 = 미입력)
  stamp: number; // 누적 도장
  visit: string; // 최근 방문일 YYYY-MM-DD
  memo: string;
  c1: boolean; // 개인정보 수집·이용 동의
  c2: boolean; // 광고성 정보 수신 동의
  c3: boolean; // 야간(21~08시) 수신 동의
  createdBy?: string; // 등록한 직원 이름
  updatedAt?: string;
}

const CUSTOMERS_PATH = path.join(process.cwd(), "data", "customers.json");

export async function getCustomers(): Promise<Customer[]> {
  try {
    const raw = await fs.readFile(CUSTOMERS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Customer[]) : [];
  } catch {
    return [];
  }
}

export async function saveCustomers(list: Customer[]): Promise<void> {
  await fs.writeFile(CUSTOMERS_PATH, JSON.stringify(list, null, 2), "utf-8");
}
