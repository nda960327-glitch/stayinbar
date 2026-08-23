"use client";

import { useEffect, useRef, useState } from "react";

// 손글씨 서명 패드 — 터치·마우스·펜 모두 지원. 저장하면 PNG data URL을 돌려줍니다.
export default function SignaturePad({
  onSave,
  onCancel,
  saving,
  label,
}: {
  onSave: (dataUrl: string) => void;
  onCancel?: () => void;
  saving?: boolean;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  // 캔버스를 화면 크기·해상도에 맞춰 준비
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk) setHasInk(true);
  }

  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    // 점 하나만 찍어도 잉크로 인정
    if (drawing.current && last.current) {
      const ctx = e.currentTarget.getContext("2d");
      if (ctx) {
        ctx.beginPath();
        ctx.arc(last.current.x, last.current.y, 1.3, 0, Math.PI * 2);
        ctx.fillStyle = "#111";
        ctx.fill();
      }
      if (!hasInk) setHasInk(true);
    }
    drawing.current = false;
    last.current = null;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setHasInk(false);
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    onSave(canvas.toDataURL("image/png"));
  }

  return (
    <div style={{ marginTop: 10 }}>
      {label && <p className="small muted" style={{ marginBottom: 6 }}>{label}</p>}
      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        style={{
          width: "100%",
          maxWidth: 420,
          height: 160,
          display: "block",
          background: "#fff",
          border: "2px dashed #bbb",
          borderRadius: 8,
          touchAction: "none",
          cursor: "crosshair",
        }}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn sm" type="button" onClick={save} disabled={!hasInk || !!saving}>
          {saving ? "저장 중…" : "✍️ 이 서명으로 서명하기"}
        </button>
        <button className="btn ghost sm" type="button" onClick={clear} disabled={!!saving}>
          지우기
        </button>
        {onCancel && (
          <button className="btn ghost sm" type="button" onClick={onCancel} disabled={!!saving}>
            취소
          </button>
        )}
      </div>
    </div>
  );
}
