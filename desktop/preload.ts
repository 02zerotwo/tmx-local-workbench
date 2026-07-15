import { contextBridge, ipcRenderer } from "electron";
import { createDesktopApi } from "./preload-bridge";

contextBridge.exposeInMainWorld("tmxDesktop", createDesktopApi(ipcRenderer));
