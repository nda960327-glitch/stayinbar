export function won(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "0원";
  return Math.round(n).toLocaleString("ko-KR") + "원";
}

export function wonShort(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "0";
  const v = Math.round(n);
  if (Math.abs(v) >= 100_000_000) return (v / 100_000_000).toFixed(2) + "억";
  if (Math.abs(v) >= 10_000) return Math.round(v / 10_000).toLocaleString("ko-KR") + "만";
  return v.toLocaleString("ko-KR");
}

export function pct(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "0%";
  return n.toFixed(1) + "%";
}

export function maskRrn(rrn: string): string {
  if (!rrn) return "-";
  const digits = rrn.replace(/[^0-9]/g, "");
  if (digits.length >= 7) return `${digits.slice(0, 6)}-${digits[6]}******`;
  return rrn;
}
