import type { TmxDesktopApi } from "./desktop-types";

export function getDesktopApi(): TmxDesktopApi | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.tmxDesktop ?? null;
}
