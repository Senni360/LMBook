// Development-only UX preview. No backend, provider secrets or vault IPC.
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  shell,
  clipboard,
} = require("electron");
const path = require("node:path");
if (app.isPackaged) throw new Error("The live preview is development-only.");
const target = new URL(
  process.env.LMBOOK_PREVIEW_URL ||
    "http://127.0.0.1:5190/?ux-lab=11&desktop-preview=1",
);
if (
  target.protocol !== "http:" ||
  target.hostname !== "127.0.0.1" ||
  target.username ||
  target.password
)
  throw new Error("The preview must use the local development server.");
app.setName("LMBook Live Preview");
app.setPath(
  "userData",
  path.resolve(__dirname, "../.work/live-preview/profile"),
);
let window;
const state = () => ({
  maximized: window.isMaximized(),
  fullscreen: window.isFullScreen(),
  focused: window.isFocused(),
  platform: process.platform,
});
const sendState = () => {
  if (window && !window.isDestroyed())
    window.webContents.send("desktop:window-state", state());
};
function trusted(event) {
  if (
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    new URL(event.senderFrame.url).origin !== target.origin
  )
    throw new Error("Untrusted preview request.");
}
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({
    title: "LMBook · Live preview",
    width: 1500,
    height: 940,
    minWidth: 680,
    minHeight: 480,
    frame: false,
    show: false,
    backgroundColor: "#181d1c",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== target.origin) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  ipcMain.handle("desktop:window-state", (event) => {
    trusted(event);
    return state();
  });
  ipcMain.handle("desktop:copy-text", (event, value) => {
    trusted(event);
    if (typeof value === "string") clipboard.writeText(value);
  });
  ipcMain.handle("desktop:window-action", async (event, action) => {
    trusted(event);
    switch (action) {
      case "minimize":
        window.minimize();
        break;
      case "maximize":
        window.isMaximized() ? window.unmaximize() : window.maximize();
        break;
      case "fullscreen":
        window.setFullScreen(!window.isFullScreen());
        break;
      case "zoom-in":
        window.webContents.setZoomLevel(
          Math.min(3, window.webContents.getZoomLevel() + 0.5),
        );
        break;
      case "zoom-out":
        window.webContents.setZoomLevel(
          Math.max(-2, window.webContents.getZoomLevel() - 0.5),
        );
        break;
      case "zoom-reset":
        window.webContents.setZoomLevel(0);
        break;
      case "data-folder":
        await shell.openPath(app.getPath("userData"));
        break;
      case "close":
      case "quit":
        app.quit();
        break;
      default:
        throw new Error("Unknown window action.");
    }
    return window.isDestroyed() ? undefined : state();
  });
  for (const event of [
    "maximize",
    "unmaximize",
    "enter-full-screen",
    "leave-full-screen",
    "focus",
    "blur",
  ])
    window.on(event, sendState);
  await window.loadURL(target.href);
  window.show();
});
app.on("window-all-closed", () => app.quit());
