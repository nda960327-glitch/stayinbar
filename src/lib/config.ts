import { promises as fs } from "fs";
import path from "path";
import type { AppConfig } from "./types";

const CONFIG_PATH = path.join(process.cwd(), "data", "config.json");

export async function getConfig(): Promise<AppConfig> {
  const raw = await fs.readFile(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as AppConfig;
}

export async function saveConfig(config: AppConfig): Promise<void> {
  try {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save config to disk (read-only filesystem?):", e);
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
