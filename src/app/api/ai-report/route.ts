import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { getLogs } from "@/lib/store";
import { computeMonthly } from "@/lib/calc";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { employeeId, month } = await req.json();
  // 직원은 본인 것만
  if (session.role !== "owner" && session.id !== employeeId) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const config = await getConfig();
  const { rows } = await getLogs();
  const result = computeMonthly(rows, config, month);
  const emp = result.employees.find((e) => e.id === employeeId);
  if (!emp) {
    return NextResponse.json({ error: "직원 데이터를 찾을 수 없습니다." }, { status: 404 });
  }

  // 텍스트가 거의 없으면 AI 호출 없이 미작성 처리 (API 키 불필요)
  const meaningful = emp.texts.filter((t) => t.replace(/\[[^\]]*\]/g, "").trim().length > 5);
  if (meaningful.length === 0) {
    return NextResponse.json({
      status: "insufficient",
      summary: "업무일지가 제대로 작성되지 않아 분석할 수 없습니다.",
      strengths: [],
      improvements: [],
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY가 설정되지 않았습니다. .env 파일에 키를 추가하세요." },
      { status: 500 }
    );
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const logText = emp.texts.join("\n");

  const systemPrompt = `너는 바(bar) 매장의 매니저를 돕는 인사 분석 어시스턴트다. 직원이 작성한 업무일지를 읽고 공정하고 구체적으로 분석한다.
반드시 아래 JSON 형식으로만 답한다:
{
  "status": "ok" | "insufficient",
  "summary": "직원의 이번 달 특징을 2~3문장으로 요약",
  "strengths": ["잘한 점", ...],
  "improvements": ["개선해야 할 점", ...]
}
규칙:
- 업무일지 내용이 형식적이거나 성의 없이 짧게(예: "함", "없음", 의미 없는 반복) 작성되었다면 status를 "insufficient"로 하고, summary에 "업무일지가 제대로 작성되지 않았습니다"라고 명시하며 strengths/improvements는 빈 배열로 둔다.
- 내용이 충실하면 status를 "ok"로 하고 근거를 일지 내용에 기반해 구체적으로 쓴다.
- 칭찬/비판 모두 실제 기록에 근거해야 하며 지어내지 않는다.
- 모든 출력은 한국어로 작성한다.`;

  const userPrompt = `직원 이름: ${emp.name} (${emp.position})
근무 요약: 출근 ${emp.attendanceDays}일, 기여점수 ${emp.score}점, 기여율 ${emp.contributionRate.toFixed(1)}%

[업무일지 기록]
${logText}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `OpenAI 오류: ${res.status} ${err}` }, { status: 502 });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json({ error: `AI 분석 실패: ${(e as Error).message}` }, { status: 500 });
  }
}
