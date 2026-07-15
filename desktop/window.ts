import { join } from "node:path";
import { BrowserWindow, shell } from "electron";
import { IPC_CHANNELS } from "./ipc/channels";

export type WindowCloseController = {
  confirm: () => void;
  dispose: () => void;
};

function isAllowedExternalUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://");
}

export async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f6f8fb",
    title: "TMX 本地翻译工作台",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault();
      if (isAllowedExternalUrl(url)) {
        void shell.openExternal(url);
      }
    }
  });
  window.once("ready-to-show", () => window.show());

  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  if (developmentUrl) {
    await window.loadURL(developmentUrl);
  } else {
    await window.loadFile(join(__dirname, "../../out/index.html"));
  }

  return window;
}

export function protectUnsavedChanges(
  window: BrowserWindow,
): WindowCloseController {
  let confirmed = false;

  const closeListener = (event: Electron.Event) => {
    if (confirmed || window.webContents.isDestroyed()) {
      return;
    }

    event.preventDefault();
    window.webContents.send(IPC_CHANNELS.events.appCloseRequested);
  };

  window.on("close", closeListener);

  return {
    confirm: () => {
      confirmed = true;
      window.close();
    },
    dispose: () => {
      window.removeListener("close", closeListener);
    },
  };
}
