import { NextResponse } from "next/server";
import {
  bumpCounter,
  clientIp,
  eventKey,
  loadDoc,
  saveDoc,
  storeAvailable,
  todayStr,
} from "@/lib/guestbook";

export const dynamic = "force-dynamic";

// 손님이 QR로 직접 여는 도장 카드(public/join.html)용 API.
// 로그인 없이 열리는 창구라, 아래 두 가지로 막아둡니다.
//  1) 같은 손님은 6시간 안에 도장이 두 번 찍히지 않음 (직원이 이미 찍어줬을 때 중복 방지)
//  2) 같은 IP에서 10분에 40번까지만 (번호 넣어보며 훑는 것 방지)
const COOLDOWN = 6 * 60 * 60 * 1000;
const IP_LIMIT = 40;
const IP_TTL = 600;
const GOAL = 5; // 도장 5개 = 선물

const normTel = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

interface Result {
  kind: "new" | "stamped" | "already";
  name: string;
  stamp: number;
  goal: number;
  done: number;
  reward: boolean;
}

export async function GET() {
  return NextResponse.json({ ready: await storeAvailable(), goal: GOAL });
}

export async function POST(req: Request) {
  if (!(await storeAvailable())) {
    return NextResponse.json({ error: "지금은 등록할 수 없어요. 직원에게 말씀해 주세요." }, { status: 503 });
  }

  const ip = clientIp(req);
  if ((await bumpCounter(`stayin.join.ip.${ip}`, IP_TTL)) > IP_LIMIT) {
    return NextResponse.json(
      { error: "잠시 후에 다시 해주세요. 급하시면 직원에게 말씀해 주세요." },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const tel = normTel(body?.tel);
  if (tel.length < 10 || tel.length > 11) {
    return NextResponse.json({ error: "휴대폰 번호 11자리를 확인해 주세요." }, { status: 400 });
  }

  const doc = await loadDoc();
  const now = Date.now();
  const existing = doc.customers.find((c) => c && String(c.tel) === tel);

  // 도장 찍기 (6시간 안에 이미 찍혔으면 그대로 둡니다)
  const stampIt = (c: any): "stamped" | "already" => {
    if (c.lastVisitAt && now - c.lastVisitAt < COOLDOWN) return "already";
    c.stamp = (c.stamp || 0) + 1;
    c.visit = todayStr();
    c.lastVisitAt = now;
    c.u = now;
    doc.events.push({ t: "re", d: todayStr(), ts: now, id: c.id, k: eventKey(), via: "qr" });
    return "stamped";
  };

  const reply = (r: Result) => NextResponse.json(r);

  // ── 재방문: 번호만 확인 ──
  if (body?.action === "checkin") {
    if (!existing) {
      return NextResponse.json(
        { error: "not-found", message: "아직 등록된 번호가 아니에요. 처음이시면 등록해 주세요!" },
        { status: 404 }
      );
    }
    const kind = stampIt(existing);
    await saveDoc(doc);
    return reply({
      kind,
      name: existing.name || "",
      stamp: existing.stamp || 0,
      goal: GOAL,
      done: existing.done || 0,
      reward: (existing.stamp || 0) >= GOAL,
    });
  }

  // ── 신규 등록 ──
  if (body?.action === "signup") {
    const name = clean(body?.name, 20);
    if (!name) {
      return NextResponse.json({ error: "이름을 적어주세요." }, { status: 400 });
    }
    if (body?.c1 !== true) {
      return NextResponse.json({ error: "개인정보 수집·이용 동의가 필요해요." }, { status: 400 });
    }

    // 같은 번호가 이미 있으면 새로 만들지 않고 도장만 찍어드립니다
    if (existing) {
      const kind = stampIt(existing);
      await saveDoc(doc);
      return reply({
        kind,
        name: existing.name || name,
        stamp: existing.stamp || 0,
        goal: GOAL,
        done: existing.done || 0,
        reward: (existing.stamp || 0) >= GOAL,
      });
    }

    const rec = {
      id: now,
      name,
      tel,
      co: clean(body?.co, 40),
      bm: Number(body?.bm) || 0,
      bd: Number(body?.bd) || 0,
      stamp: 1,
      visit: todayStr(),
      lastVisitAt: now,
      memo: "",
      c1: true,
      c2: body?.c2 === true,
      c3: body?.c3 === true,
      done: 0,
      created: todayStr(),
      via: "qr",
      u: now,
    };
    doc.customers.push(rec);
    doc.events.push({ t: "new", d: todayStr(), ts: now, id: rec.id, k: eventKey(), via: "qr" });
    await saveDoc(doc);
    return reply({ kind: "new", name, stamp: 1, goal: GOAL, done: 0, reward: false });
  }

  return NextResponse.json({ error: "알 수 없는 요청" }, { status: 400 });
}
