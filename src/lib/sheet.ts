import * as XLSX from "xlsx";
import type { LogRow } from "./types";

// 헤더 키워드로 컬럼 매칭
function findCol(headers: string[], keywords: string[]): string | null {
  for (const h of headers) {
    const hl = h.toLowerCase();
    if (keywords.some((k) => hl.includes(k.toLowerCase()))) return h;
  }
  return null;
}

// "2026-05-01", "2026. 8. 2", "2026. 8. 2 오전 10:59:58", Date 객체 등 -> YYYY-MM-DD
export function normalizeDate(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    return toISO(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  const s = String(value).trim();
  if (!s) return "";

  // 엑셀 시리얼 넘버 (숫자로 저장된 날짜)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = XLSX.SSF ? excelSerialToDate(Number(s)) : null;
    if (d) return toISO(d.y, d.m, d.d);
  }

  // YYYY-MM-DD 또는 YYYY/MM/DD
  let m = s.match(/(\d{4})[-/.\s]+(\d{1,2})[-/.\s]+(\d{1,2})/);
  if (m) return toISO(Number(m[1]), Number(m[2]), Number(m[3]));

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return toISO(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }
  return "";
}

function excelSerialToDate(serial: number): { y: number; m: number; d: number } {
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

function toISO(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

// 매출 문자열 정제: "2,4000,00" 같은 쉼표 오타 제거 후 숫자화
export function parseRevenue(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Math.round(value);
  const cleaned = String(value).replace(/[,\s원₩]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : Math.round(n);
}

// 텍스트에서 +N점 패턴 합산
export function extractScore(text: unknown): number {
  if (text == null) return 0;
  const matches = String(text).match(/\+(\d+)/g);
  if (!matches) return 0;
  return matches.reduce((sum, m) => sum + parseInt(m.replace("+", ""), 10), 0);
}

export interface ParseResult {
  rows: LogRow[];
  headers: string[];
}

// SheetJS 워크북 -> LogRow[]
export function parseWorkbook(wb: XLSX.WorkBook): ParseResult {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });
  if (json.length === 0) return { rows: [], headers: [] };

  const headers = Object.keys(json[0]);
  const nameCol = findCol(headers, ["수행자", "이름", "name"]);
  const dateCol = findCol(headers, ["영업일", "날짜", "date"]);
  const revenueCol = findCol(headers, ["매출", "revenue", "sales"]);
  const timestampCol = findCol(headers, ["타임스탬프", "timestamp", "제출"]);
  const hoursCol = findCol(headers, ["근무시간", "hours"]);

  // 텍스트(점수/AI 분석) 컬럼: 위에서 식별한 메타 컬럼 제외한 나머지
  const metaCols = new Set([nameCol, dateCol, revenueCol, timestampCol, hoursCol].filter(Boolean) as string[]);
  const textCols = headers.filter((h) => !metaCols.has(h));

  const rows: LogRow[] = [];
  for (const r of json) {
    const name = nameCol ? String(r[nameCol] ?? "").trim() : "";
    const date = dateCol ? normalizeDate(r[dateCol]) : "";
    if (!name && !date) continue;

    const revenue = revenueCol ? parseRevenue(r[revenueCol]) : 0;
    const hoursStr = hoursCol ? String(r[hoursCol] ?? "").trim() : "";
    const workedHours = hoursStr ? parseFloat(hoursStr.replace(/[^0-9.]/g, "")) : undefined;
    let score = 0;
    const texts: Record<string, string> = {};
    for (const c of textCols) {
      const val = String(r[c] ?? "").trim();
      if (val) texts[c] = val;
      score += extractScore(r[c]);
    }

    rows.push({
      timestamp: timestampCol ? String(r[timestampCol] ?? "") : "",
      name,
      date,
      revenue,
      score,
      workedHours: isNaN(workedHours as number) ? undefined : workedHours,
      texts,
    });
  }
  return { rows, headers };
}

export function parseBuffer(buf: ArrayBuffer): ParseResult {
  const bytes = new Uint8Array(buf);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK" -> xlsx
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf; // 구형 xls
  let wb: XLSX.WorkBook;
  if (isZip || isOle) {
    wb = XLSX.read(buf, { type: "array", cellDates: true });
  } else {
    // CSV/TSV 등 텍스트: UTF-8로 직접 디코드해 한글 깨짐 방지, raw로 원본 값 보존
    const text = new TextDecoder("utf-8").decode(buf);
    wb = XLSX.read(text, { type: "string", raw: true });
  }
  return parseWorkbook(wb);
}

export function parseCsvText(text: string): ParseResult {
  const wb = XLSX.read(text, { type: "string", raw: true });
  return parseWorkbook(wb);
}

export async function fetchSheetCsv(url: string): Promise<ParseResult> {
  let fetchUrl = url;
  if (url.includes("/edit") || url.includes("/view")) {
    const docIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const gidMatch = url.match(/gid=([0-9]+)/);
    if (docIdMatch) {
      const docId = docIdMatch[1];
      const gid = gidMatch ? gidMatch[1] : "0";
      fetchUrl = `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv&gid=${gid}`;
    }
  }

  const res = await fetch(fetchUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`시트 로드 실패: ${res.status}`);
  const text = await res.text();
  return parseCsvText(text);
}
