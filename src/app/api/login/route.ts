import { NextResponse } from "next/server";
import { verifyLogin, encodeSession, SESSION_COOKIE, SESSION_MAX_AGE, loginLocked, recordLoginFail } from "@/lib/auth";
import { clientIp } from "@/lib/guestbook";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (await loginLocked("login", ip)) {
    return NextResponse.json({ error: "시도가 너무 많습니다. 10분 후 다시 시도하세요." }, { status: 429 });
  }
  const { id, pin } = await req.json();
  const session = await verifyLogin(String(id ?? ""), String(pin ?? ""));
  if (!session) {
    await recordLoginFail("login", ip);
    return NextResponse.json({ error: "PIN이 올바르지 않습니다." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, session });
  res.cookies.set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
