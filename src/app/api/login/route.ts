import { NextResponse } from "next/server";
import { verifyLogin, encodeSession, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  const { id, pin } = await req.json();
  const session = await verifyLogin(String(id ?? ""), String(pin ?? ""));
  if (!session) {
    return NextResponse.json({ error: "PIN이 올바르지 않습니다." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, session });
  res.cookies.set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
