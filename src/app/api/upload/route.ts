import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseBuffer } from "@/lib/sheet";
import { saveLogs } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = getSession();
  if (!session || session.role !== "owner") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  }

  try {
    const buf = await file.arrayBuffer();
    const { rows } = parseBuffer(buf);
    if (rows.length === 0) {
      return NextResponse.json({ error: "데이터를 읽지 못했습니다. 파일 형식을 확인하세요." }, { status: 400 });
    }
    await saveLogs(rows, `upload:${file.name}`);
    return NextResponse.json({ ok: true, count: rows.length });
  } catch (e) {
    return NextResponse.json({ error: `파싱 오류: ${(e as Error).message}` }, { status: 500 });
  }
}
