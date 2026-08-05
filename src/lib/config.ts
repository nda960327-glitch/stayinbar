import { promises as fs } from "fs";
import path from "path";
import type { AppConfig } from "./types";

const CONFIG_PATH = path.join(process.cwd(), "data", "config.json");
// Vercel serverless 환경에서 /tmp는 쓰기 가능 (재배포 전까지 유지)
const TMP_CONFIG_PATH = "/tmp/app_config.json";

// ── Upstash / Vercel KV REST API (올바른 형식) ─────────────────────────────
async function kvGet(kvUrl: string, kvToken: string): Promise<AppConfig | null> {
  try {
    const res = await fetch(kvUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kvToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["get", "app_config"]),
      cache: "no-store",
    });
    const data = await res.json();
    if (!data.result) return null;
    return typeof data.result === "string"
      ? (JSON.parse(data.result) as AppConfig)
      : (data.result as AppConfig);
  } catch (e) {
    console.error("KV read error", e);
    return null;
  }
}

async function kvSet(kvUrl: string, kvToken: string, config: AppConfig): Promise<void> {
  const res = await fetch(kvUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kvToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["set", "app_config", JSON.stringify(config)]),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`KV 저장 실패 (${res.status}): ${body}`);
  }
}

// ── 외부 공개 API ─────────────────────────────────────────────────────────
export async function getConfig(): Promise<AppConfig> {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  // 1순위: Vercel KV (영구 저장)
  if (kvUrl && kvToken) {
    const kv = await kvGet(kvUrl, kvToken);
    if (kv) return kv;
  }

  // 2순위: /tmp (재배포 전까지 유지 — 설정 저장 동작)
  try {
    const tmp = await fs.readFile(TMP_CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(tmp) as AppConfig;
    return parsed;
  } catch { /* /tmp 없으면 무시 */ }

  // 3순위: 소스코드에 커밋된 기본값 config.json
  const raw = await fs.readFile(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as AppConfig;
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  // 1순위: Vercel KV (영구 — 재배포해도 유지)
  if (kvUrl && kvToken) {
    await kvSet(kvUrl, kvToken, config);
    return;
  }

  // 2순위: /tmp (재배포 전까지 유지 — Vercel 환경에서 쓰기 가능)
  try {
    await fs.writeFile(TMP_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
    return;
  } catch (e) {
    console.error("/tmp write failed:", e);
  }

  // 3순위: 로컬 개발 환경 (data/config.json 직접 쓰기)
  try {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch (e) {
    throw new Error("설정 저장 실패: 모든 저장소 접근 불가");
  }
}

// 민감정보(PIN, 주민번호, 계좌)를 제거한 공개용 설정
export function sanitizeConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    ownerPin: "",
    employees: config.employees.map((e) => ({
      ...e,
      pin: "",
      rrn: "",
      bankAccount: "",
      phone: "",
    })),
  };
}
