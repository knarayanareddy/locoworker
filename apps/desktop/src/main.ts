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
import { spawn, type ChildProcess } from "node:child_process";

const DASHBOARD_PORT = 3720;
const DASHBOARD_URL = `http://localhost:${DASHBOARD_PORT}`;

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
    shell.openExternal(url);
    return { action: "deny" };
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
            shell.openPath(process.env.COWORK_PROJECT ?? process.cwd()),
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
ipcMain.handle("open-external", (_, url: string) => shell.openExternal(url));
ipcMain.handle("open-path", (_, p: string) => shell.openPath(p));
