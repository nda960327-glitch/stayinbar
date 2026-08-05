import { promises as fs } from "fs";
import path from "path";
import type { AppConfig } from "./types";

const CONFIG_PATH = path.join(process.cwd(), "data", "config.json");

export async function getConfig(): Promise<AppConfig> {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (kvUrl && kvToken) {
    try {
      const res = await fetch(`${kvUrl}/get/app_config`, {
        headers: { Authorization: `Bearer ${kvToken}` },
        cache: 'no-store'
      });
      const data = await res.json();
      if (data.result) {
        return typeof data.result === "string" ? JSON.parse(data.result) as AppConfig : data.result as AppConfig;
      }
    } catch (e) {
      console.error("KV read error", e);
    }
  }

  const raw = await fs.readFile(CONFIG_PATH, "utf-8");
  const config = JSON.parse(raw) as AppConfig;

  // Migrate to KV if KV is set but empty
  if (kvUrl && kvToken) {
    try {
      await saveConfig(config);
    } catch (e) {
      console.error("Migration to KV failed", e);
    }
  }

  return config;
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (kvUrl && kvToken) {
    const res = await fetch(`${kvUrl}/set/app_config`, {
      method: "POST",
      headers: { Authorization: `Bearer ${kvToken}` },
      body: JSON.stringify(config)
    });
    if (!res.ok) {
      throw new Error(`KV 데이터베이스 저장 실패: ${res.status}`);
    }
    return;
  }

  try {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save config to disk (read-only filesystem?):", e);
    throw new Error("서버가 읽기 전용 상태입니다. 설정 저장을 위해 Vercel KV Storage를 연결해 주세요.");
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
