import { promises as fs } from "fs";
import path from "path";
import type { LogRow } from "./types";
import { fetchSheetCsv } from "./sheet";
import { getConfig } from "./config";

const LOGS_PATH = path.join(process.cwd(), "data", "logs.json");

interface LogStore {
  updatedAt: string;
  source: string;
  rows: LogRow[];
}

export async function saveLogs(rows: LogRow[], source: string): Promise<void> {
  const store: LogStore = { updatedAt: new Date().toISOString(), source, rows };
  await fs.writeFile(LOGS_PATH, JSON.stringify(store, null, 2), "utf-8");
}

async function readStoredLogs(): Promise<LogStore | null> {
  try {
    const raw = await fs.readFile(LOGS_PATH, "utf-8");
    return JSON.parse(raw) as LogStore;
  } catch {
    return null;
  }
}

// 데이터 소스 우선순위: 구글시트 URL(설정 시) > 마지막 업로드 파일
export async function getLogs(): Promise<{
  rows: LogRow[];
  source: string;
  updatedAt: string;
}> {
  const config = await getConfig();
  if (config.sheetCsvUrl) {
    let fetchedRows: LogRow[] | null = null;
    try {
      const result = await fetchSheetCsv(config.sheetCsvUrl);
      fetchedRows = result.rows;
    } catch (e) {
      console.error("fetchSheetCsv Error:", e);
    }

    if (fetchedRows) {
      try {
        await saveLogs(fetchedRows, "google-sheet");
      } catch (e) {
        console.error("saveLogs Error:", e);
      }
      return { rows: fetchedRows, source: "google-sheet", updatedAt: new Date().toISOString() };
    }
  }
  const stored = await readStoredLogs();
  if (stored) return { rows: stored.rows, source: stored.source, updatedAt: stored.updatedAt };
  return { rows: [], source: "none", updatedAt: "" };
}
