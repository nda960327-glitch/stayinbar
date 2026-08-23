import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConfig, saveConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

// 근로계약서 전자서명
// - 근로자: 자기 계약서의 "을" 칸에만 서명 가능
// - 사장  : 모든 계약서의 "갑" 칸에 서명, 서명 삭제(다시 받기) 가능
const MAX_SIG_LEN = 300_000; // data URL 길이 제한 (~220KB PNG)

export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const employeeId = String(body.employeeId ?? "");
  const party = body.party === "owner" ? "owner" : "employee";
  const action = body.action === "clear" ? "clear" : "sign";
  const signature = typeof body.signature === "string" ? body.signature : "";

  // 권한 확인
  if (party === "owner" && session.role !== "owner") {
    return NextResponse.json({ error: "사용자(갑) 서명은 사장만 할 수 있습니다." }, { status: 403 });
  }
  if (party === "employee" && session.role !== "owner" && session.id !== employeeId) {
    return NextResponse.json({ error: "본인 계약서에만 서명할 수 있습니다." }, { status: 403 });
  }
  if (action === "clear" && session.role !== "owner") {
    return NextResponse.json({ error: "서명 삭제는 사장만 할 수 있습니다." }, { status: 403 });
  }
  if (action === "sign") {
    if (!signature.startsWith("data:image/png;base64,") || signature.length < 200) {
      return NextResponse.json({ error: "서명 이미지가 없습니다. 서명란에 서명을 그려주세요." }, { status: 400 });
    }
    if (signature.length > MAX_SIG_LEN) {
      return NextResponse.json({ error: "서명 이미지가 너무 큽니다." }, { status: 400 });
    }
  }

  const config = await getConfig();
  const idx = config.employees.findIndex((e) => e.id === employeeId);
  if (idx === -1) {
    return NextResponse.json({ error: "직원을 찾을 수 없습니다." }, { status: 404 });
  }

  const emp = config.employees[idx];
  const contract = { ...(emp.contract ?? {}) };
  const now = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16); // KST

  if (party === "owner") {
    if (action === "clear") {
      contract.ownerSigned = false;
      delete contract.ownerSignature;
      delete contract.ownerSignedAt;
    } else {
      contract.ownerSigned = true;
      contract.ownerSignature = signature;
      contract.ownerSignedAt = now;
    }
  } else {
    if (action === "clear") {
      contract.employeeSigned = false;
      delete contract.employeeSignature;
      delete contract.employeeSignedAt;
    } else {
      // 이미 서명된 계약서는 근로자가 덮어쓸 수 없음 (사장이 삭제 후 다시 받기)
      if (contract.employeeSigned && contract.employeeSignature && session.role !== "owner") {
        return NextResponse.json({ error: "이미 서명된 계약서입니다. 다시 서명하려면 사장님께 요청하세요." }, { status: 409 });
      }
      contract.employeeSigned = true;
      contract.employeeSignature = signature;
      contract.employeeSignedAt = now;
    }
  }
  if (!contract.signedAt && action === "sign") contract.signedAt = now.slice(0, 10);

  config.employees[idx] = { ...emp, contract };
  try {
    await saveConfig(config);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "저장 실패" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, contract });
}
