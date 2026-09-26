"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function TopBar({
  name,
  role,
  business,
}: {
  name: string;
  role: string;
  business: string;
}) {
  const router = useRouter();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [unread, setUnread] = useState(0);

  // 안 읽은 쪽지 수 (임원 계정은 쪽지함이 없다)
  useEffect(() => {
    if (role === "exec") return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/notes");
        if (!res.ok) return;
        const d = await res.json();
        if (alive) setUnread(d.unread ?? 0);
      } catch { /* 네트워크 오류는 조용히 넘어간다 */ }
    };
    tick();
    const t = setInterval(tick, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [role]);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setDeferredPrompt(null);
    } else {
      alert("📱 [앱으로 설치하는 방법]\n\n🍎 아이폰(Safari): 화면 맨 아래의 '공유 버튼[ ⍐ ]'을 누르고 '홈 화면에 추가'를 선택하세요.\n\n🤖 안드로이드(Chrome/삼성인터넷): 화면 오른쪽 아래/위의 '메뉴[ ⋮ ]'를 누르고 '홈 화면에 추가' 또는 '앱 설치'를 선택하세요.");
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <div className="topbar">
      <div className="brand">
        <span className="dot" />
        <div>
          STAY IN BAR
          <small>{business} 리포트</small>
        </div>
      </div>
      <div className="who">
        <span className={`pill ${role === "owner" || role === "exec" ? "owner" : ""}`}>
          {name}
          {role === "owner" ? " · 사장" : role === "exec" ? " · 임원" : ""}
        </span>

        {role !== "exec" && (
          <a href="/notes">
            쪽지
            {unread > 0 && (
              <span className="badge">{unread > 99 ? "99+" : unread}</span>
            )}
          </a>
        )}
        <a href="/projects">프로젝트</a>
        <a href="/customers">고객관리</a>
        {role === "owner" && (
          <>
            <a href="/owner">대시보드</a>
            <a href="/settings">설정</a>
          </>
        )}
        <button className="btn sm" onClick={handleInstall} style={{ padding: "4px 8px", background: "var(--accent-2)" }}>
          앱 설치
        </button>
        <button className="btn ghost sm" onClick={logout}>
          로그아웃
        </button>
      </div>
    </div>
  );
}
