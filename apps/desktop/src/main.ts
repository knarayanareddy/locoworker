/**
 * CoWork Desktop App — Electron main process.
 * Renders the web dashboard in a native window,
 * starts the cowork HTTP dashboard server,
 * and provides system tray integration.
 */

import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  shell,
  globalShortcut,
} from "electron";
import path from "path";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

const DASHBOARD_PORT = 3720;
const DASHBOARD_URL = `http://localhost:${DASHBOARD_PORT}`;

/** Only https URLs (plus our own loopback dashboard) may leave the app. */
function isAllowedExternalUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol === "http:") {
      return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    }
    return false;
  } catch {
    return false;
  }
}

/** `shell.openPath` is confined to the project and the cowork state root. */
function isAllowedOpenPath(requested: string): boolean {
  const target = resolve(requested);
  const roots = [
    resolve(process.env.COWORK_PROJECT ?? process.cwd()),
    join(homedir(), ".cowork", "projects"),
  ];
  return roots.some((root) => {
    const rel = relative(root, target);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  });
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let dashboardProcess: ChildProcess | null = null;

// ── App lifecycle ──────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  await startDashboardServer();
  createWindow();
  createTray();
  registerGlobalShortcuts();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("quit", () => {
  dashboardProcess?.kill();
  globalShortcut.unregisterAll();
});

// ── Dashboard server ───────────────────────────────────────────────────────────

async function startDashboardServer(): Promise<void> {
  return new Promise((resolve) => {
    // Start the Bun dashboard server as a child process
    dashboardProcess = spawn(
      "bun",
      [
        "run",
        path.join(__dirname, "../../../apps/dashboard/src/server.ts"),
        "--port",
        String(DASHBOARD_PORT),
        "--project",
        process.env.COWORK_PROJECT ?? process.cwd(),
      ],
      {
        stdio: "pipe",
        env: { ...process.env },
      }
    );

    dashboardProcess.stderr?.on("data", (data) => {
      const msg = data.toString();
      if (msg.includes("Running at")) {
        resolve();
      }
    });

    // Resolve after 2s regardless
    setTimeout(resolve, 2000);
  });
}

// ── Main window ────────────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, "../assets/icon.png"),
    show: false,
  });

  // Load the dashboard
  mainWindow.loadURL(DASHBOARD_URL);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    else process.stderr.write(`[desktop] blocked external URL: ${url}\n`);
    return { action: "deny" };
  });

  // Defence in depth: add a CSP even when the dashboard did not send one.
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
          "connect-src 'self' http://localhost:3720; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        ],
        "X-Content-Type-Options": ["nosniff"],
      },
    });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── System Tray ────────────────────────────────────────────────────────────────

function createTray(): void {
  const iconPath = path.join(__dirname, "../assets/tray-icon.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open CoWork",
      click: () => {
        if (mainWindow) mainWindow.show();
        else createWindow();
      },
    },
    {
      label: "Open Dashboard",
      click: () => shell.openExternal(DASHBOARD_URL),
    },
    { type: "separator" },
    {
      label: "Project",
      submenu: [
        {
          label: "Open Project Folder",
          click: () =>
            void shell.openPath(process.env.COWORK_PROJECT ?? process.cwd()),
        },
        {
          label: "Open Memory Folder",
          click: () => {
            const memRoot = path.join(
              process.env.HOME ?? "~",
              ".cowork",
              "projects"
            );
            shell.openPath(memRoot);
          },
        },
      ],
    },
    { type: "separator" },
    {
      label: "Quit CoWork",
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip("CoWork");

  tray.on("click", () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    } else {
      createWindow();
    }
  });
}

// ── Global shortcuts ───────────────────────────────────────────────────────────

function registerGlobalShortcuts(): void {
  // Cmd/Ctrl+Shift+C → show/hide window
  globalShortcut.register("CommandOrControl+Shift+C", () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    } else {
      createWindow();
    }
  });
}

// ── IPC handlers ───────────────────────────────────────────────────────────────

ipcMain.handle("get-project-root", () => process.env.COWORK_PROJECT ?? process.cwd());
ipcMain.handle("open-external", (_, url: string) => {
  if (typeof url !== "string" || !isAllowedExternalUrl(url)) {
    throw new Error("Blocked external URL: only https (or the local dashboard) is allowed");
  }
  return shell.openExternal(url);
});
ipcMain.handle("open-path", (_, p: string) => {
  if (typeof p !== "string" || !isAllowedOpenPath(p)) {
    throw new Error("Blocked open-path: target is outside the project or cowork state directory");
  }
  return shell.openPath(p);
});
