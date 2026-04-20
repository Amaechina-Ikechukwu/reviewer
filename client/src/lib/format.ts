export function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString([], { dateStyle: "medium" });
}

export function formatRelative(value: string) {
  const then = new Date(value).getTime();
  const now = Date.now();
  const diff = now - then;
  const abs = Math.abs(diff);
  const sec = Math.round(abs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);

  const fut = diff < 0;
  const fmt = (n: number, unit: string) => (fut ? `in ${n} ${unit}${n === 1 ? "" : "s"}` : `${n} ${unit}${n === 1 ? "" : "s"} ago`);

  if (sec < 60) return fut ? "in a moment" : "just now";
  if (min < 60) return fmt(min, "min");
  if (hr < 24) return fmt(hr, "hr");
  if (day < 30) return fmt(day, "day");
  return formatDate(value);
}
