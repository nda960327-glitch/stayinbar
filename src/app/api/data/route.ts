import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { getLogs } from "@/lib/store";
import { computeMonthly } from "@/lib/calc";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") ?? undefined;

  const config = await getConfig();
  const { rows, source, updatedAt, error: fetchError } = await getLogs();
  
  if (fetchError && rows.length === 0) {
    return NextResponse.json({ error: `구글시트에서 데이터를 가져오는 데 실패했습니다: ${fetchError}` }, { status: 500 });
  }

  const result = computeMonthly(rows, config, month);

  // 직원은 본인 데이터만
  if (session.role !== "owner") {
    const mine = result.employees.find((e) => e.id === session.id) ?? null;
    return NextResponse.json({
      role: session.role,
      month: result.month,
      availableMonths: result.availableMonths,
      businessName: config.businessName,
      totalSales: result.totalSales,
      workingDays: result.workingDays,
      targetSales: result.targetSales,
      targetAchievement: result.owner.targetAchievement,
      me: mine,
      source,
      updatedAt,
    });
  }

  // 사장은 전체
  return NextResponse.json({
    role: "owner",
    businessName: config.businessName,
    source,
    updatedAt,
    ...result,
  });
}
