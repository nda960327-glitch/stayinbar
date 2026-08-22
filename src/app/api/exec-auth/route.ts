import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { encodeSession, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();
    const config = await getConfig();
    const execPin = config.execPin ?? "240901";
    if (pin === execPin) {
      const res = NextResponse.json({ ok: true });
      res.cookies.set(SESSION_COOKIE, encodeSession({ id: "exec-user", name: "임원", role: "owner" }), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 12,
      });
      return res;
    }
    return NextResponse.json({ error: "잘못된 PIN입니다." }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
