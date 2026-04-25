import { AccountTheme } from "./types";

export function applyTheme(t: AccountTheme) {
  const r = document.documentElement;
  r.style.setProperty("--background", t.bg);
  r.style.setProperty("--card", t.card);
  r.style.setProperty("--popover", t.card);
  r.style.setProperty("--primary", t.primary);
  r.style.setProperty("--primary-foreground", t.primaryFg);
  r.style.setProperty("--accent", t.primary);
  r.style.setProperty("--accent-foreground", t.primaryFg);
  r.style.setProperty("--ring", t.primary);
  r.style.setProperty("--border", t.border);
  r.style.setProperty("--input", t.border);
  r.style.setProperty("--muted", t.muted);
  r.style.setProperty("--muted-foreground", t.mutedFg);
  r.style.setProperty("--foreground", t.fg);
  r.style.setProperty("--card-foreground", t.fg);
  r.style.setProperty("--popover-foreground", t.fg);
}

export function resetTheme() {
  const r = document.documentElement;
  [
    "--background","--card","--popover","--primary","--primary-foreground",
    "--accent","--accent-foreground","--ring","--border","--input",
    "--muted","--muted-foreground","--foreground","--card-foreground","--popover-foreground"
  ].forEach((k) => r.style.removeProperty(k));
}
