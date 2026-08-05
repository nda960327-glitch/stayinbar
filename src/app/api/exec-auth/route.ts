import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();
    const config = await getConfig();
    const execPin = config.execPin ?? "5678";
    if (pin === execPin) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "잘못된 PIN입니다." }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
