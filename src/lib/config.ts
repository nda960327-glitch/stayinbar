import { promises as fs } from "fs";
import path from "path";
import type { AppConfig } from "./types";

const CONFIG_PATH = path.join(process.cwd(), "data", "config.json");
const TMP_CONFIG_PATH = "/tmp/app_config.json";
const GITHUB_OWNER = "nda960327-glitch";
const GITHUB_REPO = "stayinbar";
const GITHUB_FILE = "data/config.json";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

// ── GitHub Contents API ────────────────────────────────────────────────────
async function githubGet(): Promise<AppConfig | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(GITHUB_API, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return JSON.parse(content) as AppConfig;
  } catch {
    return null;
  }
}

async function githubSet(config: AppConfig): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN 미설정");

  // 현재 파일의 SHA 조회 (덮어쓰기에 필요)
  const getRes = await fetch(GITHUB_API, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
    cache: "no-store",
  });
  if (!getRes.ok) throw new Error("GitHub 파일 조회 실패");
  const { sha } = await getRes.json();

  const encoded = Buffer.from(
    JSON.stringify(config, null, 2)
  ).toString("base64");

  const putRes = await fetch(GITHUB_API, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: "chore: Update app config",
      content: encoded,
      sha,
      branch: "main",
    }),
  });
  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    throw new Error(`GitHub 저장 실패: ${(err as any).message ?? putRes.status}`);
  }
}

// ── Upstash / Vercel KV (보조 수단) ───────────────────────────────────────
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
  } catch {
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
  if (!res.ok) throw new Error(`KV 저장 실패: ${res.status}`);
}

// ── 기본값 채우기 ─────────────────────────────────────────────────────────
// 소스코드에 커밋된 data/config.json 을 기본값으로 삼는다.
// KV·/tmp 등에 예전에 저장된 설정에는 나중에 추가된 항목(공지, 순이익 인센티브 등)이 없을 수 있으므로
// 빠진 항목은 기본값으로 채워 코드 배포만으로도 새 기능이 바로 동작하게 한다.
const LEGACY_EXEC_PIN = "5678"; // 예전 초기 PIN — 아직 이 값이면 새 초기 PIN으로 넘긴다

async function readBundledConfig(): Promise<AppConfig> {
  const raw = await fs.readFile(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as AppConfig;
}

async function withDefaults(stored: AppConfig): Promise<AppConfig> {
  const bundled = await readBundledConfig();
  const merged: AppConfig = { ...bundled, ...stored };
  if (!stored.execPin || stored.execPin === LEGACY_EXEC_PIN) merged.execPin = bundled.execPin;
  if (!Array.isArray(stored.notices)) merged.notices = bundled.notices ?? [];
  if (typeof stored.incentiveProfitRate !== "number") merged.incentiveProfitRate = bundled.incentiveProfitRate;
  if (!stored.incentiveProfitStartMonth) merged.incentiveProfitStartMonth = bundled.incentiveProfitStartMonth;
  if (typeof stored.monthlyTarget !== "number") merged.monthlyTarget = bundled.monthlyTarget;
  if (!stored.businessAddress) merged.businessAddress = bundled.businessAddress;
  if (!stored.ownerName) merged.ownerName = bundled.ownerName;
  return merged;
}

// ── 외부 공개 API ─────────────────────────────────────────────────────────
export async function getConfig(): Promise<AppConfig> {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  // 1순위: GitHub API (GITHUB_TOKEN 설정 시) — 모든 기기에서 즉시 반영
  if (process.env.GITHUB_TOKEN) {
    const gh = await githubGet();
    if (gh) return withDefaults(gh);
  }

  // 2순위: Vercel KV (KV 스토리지 연결 시)
  if (kvUrl && kvToken) {
    const kv = await kvGet(kvUrl, kvToken);
    if (kv) return withDefaults(kv);
  }

  // 3순위: /tmp (재배포 전까지, 같은 인스턴스에서만)
  try {
    const tmp = await fs.readFile(TMP_CONFIG_PATH, "utf-8");
    return withDefaults(JSON.parse(tmp) as AppConfig);
  } catch { /* 없으면 무시 */ }

  // 4순위: 소스코드에 커밋된 기본 config.json
  return readBundledConfig();
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  // 1순위: GitHub API — 저장 즉시 모든 기기에서 보임 (권장)
  if (process.env.GITHUB_TOKEN) {
    await githubSet(config);
    // /tmp에도 동시 저장해 즉각 반영 보조
    try { await fs.writeFile(TMP_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8"); } catch { }
    return;
  }

  // 2순위: Vercel KV
  if (kvUrl && kvToken) {
    await kvSet(kvUrl, kvToken, config);
    return;
  }

  // 3순위: /tmp (같은 Vercel 인스턴스 한정)
  try {
    await fs.writeFile(TMP_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
    return;
  } catch { }

  // 4순위: 로컬 개발 환경 파일 쓰기
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

// 민감정보(PIN, 주민번호, 계좌)를 제거한 공개용 설정
export function sanitizeConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    ownerPin: "",
    execPin: "",
    employees: config.employees.map((e) => ({
      ...e,
      pin: "",
      rrn: "",
      bankAccount: "",
      phone: "",
    })),
  };
}
