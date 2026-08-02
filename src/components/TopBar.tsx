"use client";

import { useRouter } from "next/navigation";

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

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/");
    router.refresh();
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
        <span className={`pill ${role === "owner" ? "owner" : ""}`}>
          {name}
          {role === "owner" ? " · 사장" : ""}
        </span>
        {role === "owner" && (
          <>
            <a href="/owner">대시보드</a>
            <a href="/settings">설정</a>
          </>
        )}
        <button className="btn ghost sm" onClick={logout}>
          로그아웃
        </button>
      </div>
    </div>
  );
}
