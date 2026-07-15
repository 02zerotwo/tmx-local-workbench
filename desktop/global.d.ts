import type { TmxDesktopApi } from "../src/lib/desktop-types";

declare global {
  interface Window {
    tmxDesktop?: TmxDesktopApi;
  }
}

export {};
