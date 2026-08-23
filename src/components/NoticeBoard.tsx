import type { Notice } from "@/lib/types";

// 공지사항 카드 — 직원 / 사장 / 임원 화면 상단 공통
export default function NoticeBoard({ notices }: { notices?: Notice[] }) {
  const list = (notices ?? [])
    .filter((n) => n && (n.title?.trim() || n.body?.trim()))
    .sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (b.date || "").localeCompare(a.date || "");
    });
  if (list.length === 0) return null;

  return (
    <div className="card notice-board">
      <h2>
        📢 공지사항 <span className="sub">{list.length}건</span>
      </h2>
      {list.map((n) => (
        <div className="notice-item" key={n.id}>
          <div className="notice-head">
            <strong>{n.pinned ? "📌 " : ""}{n.title}</strong>
            {n.date && <span className="muted small">{n.date}</span>}
          </div>
          {n.body && <div className="notice-body">{n.body}</div>}
        </div>
      ))}
    </div>
  );
}
