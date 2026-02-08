const { app, BrowserWindow } = require("electron");

const DASHBOARD_URL =
  process.env.JARVAS_DASHBOARD_URL || "http://127.0.0.1:3777";

function assertLocalhostOnly(value) {
  try {
    const parsed = new URL(value);
    if (parsed.hostname !== "127.0.0.1") {
      throw new Error("Dashboard URL must be 127.0.0.1.");
    }
  } catch (error) {
    throw new Error(
      `Invalid dashboard URL. ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function createWindow() {
  assertLocalhostOnly(DASHBOARD_URL);
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    fullscreen: true,
    backgroundColor: "#0b0e14",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadURL(DASHBOARD_URL).catch((error) => {
    win.loadURL(
      "data:text/plain,Dashboard unavailable. Start the local server first."
    );
    console.error(error);
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
