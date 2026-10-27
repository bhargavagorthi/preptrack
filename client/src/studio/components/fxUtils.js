// Helpers shared by the student pages
export const SUBJECT_COLORS = ["#2563eb", "#1f9d63", "#e07a1f", "#c2417a", "#1d7fb8", "#7c4dcc"];

export const when = (iso) =>
  new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function until(ms) {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m >= 10) return `${m}m`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export const pctOf = (score, max) => (max ? Math.max(0, Math.round((score / max) * 100)) : 0);
