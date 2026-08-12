import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConfig, saveConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

// 직원이 자기 PIN을 직접 바꿉니다 (지금 쓰는 PIN을 알아야 바꿀 수 있습니다)
export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { current, next } = await req.json();
  const cur = String(current ?? "");
  const nxt = String(next ?? "");

  if (!/^\d{4,12}$/.test(nxt)) {
    return NextResponse.json({ error: "새 PIN은 숫자 4~12자리로 정해주세요." }, { status: 400 });
  }
  if (cur === nxt) {
    return NextResponse.json({ error: "지금 쓰는 PIN과 다르게 정해주세요." }, { status: 400 });
  }

  const config = await getConfig();
  const idx = config.employees.findIndex((e) => e.id === session.id);
  if (idx === -1) {
    // 임원 대시보드 계정 등 직원 명단에 없는 로그인
    return NextResponse.json({ error: "이 계정은 PIN을 바꿀 수 없습니다." }, { status: 403 });
  }
  if (config.employees[idx].pin !== cur) {
    return NextResponse.json({ error: "지금 쓰는 PIN이 맞지 않습니다." }, { status: 403 });
  }

  config.employees[idx].pin = nxt;
  try {
    await saveConfig(config);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "저장 실패" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
