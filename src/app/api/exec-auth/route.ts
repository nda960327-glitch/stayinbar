import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { encodeSession, SESSION_COOKIE, SESSION_MAX_AGE, loginLocked, recordLoginFail } from "@/lib/auth";
import { clientIp } from "@/lib/guestbook";

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    if (await loginLocked("exec", ip)) {
      return NextResponse.json({ error: "시도가 너무 많습니다. 10분 후 다시 시도하세요." }, { status: 429 });
    }
    const { pin } = await req.json();
    const config = await getConfig();
    const execPin = config.execPin ?? "0901";
    if (pin === execPin) {
      const res = NextResponse.json({ ok: true });
      // owner가 아닌 exec 권한 — 대시보드 조회만 되고 /settings 등은 막힌다
      res.cookies.set(SESSION_COOKIE, encodeSession({ id: "exec", name: "임원", role: "exec" }), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE,
      });
      return res;
    }
    await recordLoginFail("exec", ip);
    return NextResponse.json({ error: "잘못된 PIN입니다." }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
