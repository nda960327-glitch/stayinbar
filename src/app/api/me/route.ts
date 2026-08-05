import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConfig, saveConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const session = getSession();
  if (!session || session.role === "owner") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const { phone, rrn, bankAccount } = await req.json();

  const config = await getConfig();
  const empIdx = config.employees.findIndex((e) => e.id === session.id);
  if (empIdx === -1) {
    return NextResponse.json({ error: "직원을 찾을 수 없습니다." }, { status: 404 });
  }

  if (phone !== undefined) config.employees[empIdx].phone = phone;
  if (rrn !== undefined) config.employees[empIdx].rrn = rrn;
  if (bankAccount !== undefined) config.employees[empIdx].bankAccount = bankAccount;

  await saveConfig(config);

  return NextResponse.json({ ok: true });
}
