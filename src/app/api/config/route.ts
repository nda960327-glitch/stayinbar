import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConfig, saveConfig, sanitizeConfig } from "@/lib/config";
import type { AppConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const config = await getConfig();
  // 사장만 전체(민감정보 포함), 그 외는 공개용
  if (session.role === "owner") {
    return NextResponse.json(config);
  }
  return NextResponse.json(sanitizeConfig(config));
}

export async function PUT(req: Request) {
  const session = getSession();
  if (!session || session.role !== "owner") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  const body = (await req.json()) as AppConfig;
  try {
    await saveConfig(body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
