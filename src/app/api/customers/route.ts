import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCustomers, saveCustomers, type Customer } from "@/lib/customers";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const customers = await getCustomers();
  return NextResponse.json(customers);
}

// 한 명 등록 또는 수정 (id가 같으면 덮어쓰기)
export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const body = (await req.json()) as Customer;
  if (!body?.name || !body?.tel) {
    return NextResponse.json({ error: "이름과 휴대폰 번호는 필수입니다." }, { status: 400 });
  }
  const record: Customer = {
    ...body,
    tel: String(body.tel).replace(/\D/g, ""),
    updatedAt: new Date().toISOString(),
    createdBy: body.createdBy || session.name,
  };
  const customers = await getCustomers();
  const idx = customers.findIndex((c) => c.id === record.id);
  if (idx >= 0) customers[idx] = record;
  else customers.push(record);
  await saveCustomers(customers);
  return NextResponse.json({ ok: true, customer: record });
}

// 전체 교체 — 백업 복원 · 전부 지우기 (사장 전용)
export async function PUT(req: Request) {
  const session = getSession();
  if (!session || session.role !== "owner") {
    return NextResponse.json({ error: "사장님만 할 수 있습니다." }, { status: 403 });
  }
  const body = await req.json();
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "백업 파일 형식이 아닙니다." }, { status: 400 });
  }
  await saveCustomers(body as Customer[]);
  return NextResponse.json({ ok: true, count: body.length });
}

export async function DELETE(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  }
  const customers = await getCustomers();
  const next = customers.filter((c) => c.id !== id);
  if (next.length === customers.length) {
    return NextResponse.json({ error: "해당 손님이 없습니다." }, { status: 404 });
  }
  await saveCustomers(next);
  return NextResponse.json({ ok: true });
}
