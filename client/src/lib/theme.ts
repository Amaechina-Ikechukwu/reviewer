const KEY = "reviewer.theme";
type Mode = "light" | "dark";

function preferredMode(): Mode {
  const saved = localStorage.getItem(KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(mode: Mode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
}

export function initTheme() {
  apply(preferredMode());
}

export function getTheme(): Mode {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(mode: Mode) {
  localStorage.setItem(KEY, mode);
  apply(mode);
  window.dispatchEvent(new CustomEvent("theme-change", { detail: mode }));
}

export function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}
