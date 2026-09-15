const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  dialog,
  ipcMain,
  shell,
  utilityProcess,
  powerSaveBlocker,
  protocol,
  net,
  clipboard,
} = require("electron");
const { randomBytes } = require("node:crypto");
const { existsSync, mkdirSync, appendFileSync } = require("node:fs");
const path = require("node:path");
const { createDownloadManager } = require("./downloads.cjs");
const appOrigin = "sennibook://app";
protocol.registerSchemesAsPrivileged([
  {
    scheme: "sennibook",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);
function isAppUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "sennibook:" &&
      url.hostname === "app" &&
      !url.port &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

app.setName("LMBook");
// Keep the existing library, provider configuration and Chromium profile together.
// The private origin and persisted storage keys also retain their original names.
const userDataOverride =
  process.env.LMBOOK_USER_DATA || process.env.SENNIBOOK_USER_DATA;
const legacyUserData = path.join(app.getPath("appData"), "SenniBook");
app.setPath(
  "userData",
  userDataOverride
    ? path.resolve(userDataOverride)
    : existsSync(legacyUserData)
      ? legacyUserData
      : path.join(app.getPath("appData"), "LMBook"),
);
const hasLock = app.requestSingleInstanceLock();
let window, backend, tray, origin, poll, blocker, downloads;
let quitting = false,
  closePrompt = false,
  activeJobs = 0;
const token = randomBytes(32).toString("hex");
// Resolve assets relative to this entry point in both source and app.asar.
// Electron's app path is the electron/ folder when a diagnostic launches this
// file directly, which otherwise duplicates electron/ in the backend path.
const root = path.resolve(__dirname, "..");
const userData = app.getPath("userData");
mkdirSync(userData, { recursive: true });
const logPath = path.join(userData, "desktop.log");
function log(message) {
  appendFileSync(
    logPath,
    `${new Date().toISOString()} ${String(message).slice(0, 2000)}\n`,
  );
}
function showWindow() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
async function requestQuit() {
  if (closePrompt || quitting) return;
  if (origin && backend) {
    try {
      const response = await fetch(origin + "/api/status", {
        headers: { "x-sennibook-desktop": token },
        signal: AbortSignal.timeout(2000),
      });
      activeJobs = Object.keys((await response.json()).activeJobs || {}).length;
    } catch {
    }
  }
  if (activeJobs) {
    closePrompt = true;
    const result = await dialog.showMessageBox(window, {
      type: "question",
      title: "Generation is still running",
      message: "Keep your episode generation running?",
      detail:
        "You can leave LMBook in the system tray. Quitting cancels active work; completed chapters remain saved.",
      buttons: [
        "Keep working in background",
        "Stay in LMBook",
        "Cancel jobs and quit",
      ],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    closePrompt = false;
    if (result.response === 0) {
      window.hide();
      return;
    }
    if (result.response === 1) return;
  }
  quitting = true;
  app.quit();
}
async function startBackend() {
  const dataDir = path.join(userData, "data");
  const oldData = path.join(root, "data");
  if (
    !existsSync(path.join(dataDir, "sennibook.sqlite")) &&
    existsSync(path.join(oldData, "sennibook.sqlite"))
  ) {
    // Copy only while no legacy process owns the DB; desktop import is explicit instead.
    log("A browser-edition database exists. It remains at " + oldData);
  }
  mkdirSync(dataDir, { recursive: true });
  return new Promise((resolve, reject) => {
    let ready = false;
    backend = utilityProcess.fork(
      path.join(root, "electron", "backend.cjs"),
      [],
      {
        cwd: userData,
        serviceName: "LMBook learning engine",
        stdio: "pipe",
        env: {
          ...process.env,
          PORT: "0",
          DATA_DIR: dataDir,
          DOTENV_CONFIG_PATH: path.join(userData, ".env"),
          SENNIBOOK_ASSETS: path.join(root, "dist"),
          SENNIBOOK_DESKTOP_TOKEN: token,
          SENNIBOOK_NODE_EXEC: process.execPath,
          SENNIBOOK_TRANSCRIBE_WORKER: app.isPackaged
            ? path.join(process.resourcesPath, "python", "transcribe.py")
            : path.join(root, "python", "transcribe.py"),
          SENNIBOOK_OCR_ASSETS: app.isPackaged
            ? path.join(process.resourcesPath, "ocr")
            : path.join(root, "resources", "ocr"),
          SENNIBOOK_OCR_WORKER: path.join(
            root,
            "server-dist",
            "ocr-worker.cjs",
          ),
        },
      },
    );
    const timer = setTimeout(
      () =>
        reject(
          new Error("The learning engine did not start within 30 seconds."),
        ),
      30000,
    );
    backend.stdout?.on("data", (data) => log(data.toString().trim()));
    backend.stderr?.on("data", (data) => log(data.toString().trim()));
    backend.on("message", (message) => {
      if (message.type === "ready") {
        ready = true;
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${message.port}`);
      }
      if (message.type === "error") {
        clearTimeout(timer);
        reject(new Error(message.message));
      }
    });
    backend.once("exit", (code) => {
      clearTimeout(timer);
      backend = undefined;
      if (!ready)
        reject(
          new Error(`The learning engine exited during startup (${code}).`),
        );
      else if (!quitting) {
        if (blocker !== undefined && powerSaveBlocker.isStarted(blocker))
          powerSaveBlocker.stop(blocker);
        clearInterval(poll);
        log("The learning engine stopped unexpectedly.");
        if (!process.env.SENNIBOOK_TEST_HIDDEN)
          dialog.showErrorBox(
            "LMBook needs to restart",
            "The learning engine stopped unexpectedly. Completed work is saved. Reopen LMBook to continue.\n\nLog: " +
              logPath,
          );
        quitting = true;
        app.quit();
      }
    });
  });
}
function verifySender(event) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    !isAppUrl(event.senderFrame.url)
  )
  throw new Error("Untrusted desktop request.");
}
async function setup() {
  origin = await startBackend();
  if (quitting || !backend) return;
  protocol.handle("sennibook", async (request) => {
    if (!isAppUrl(request.url))
      return new Response("Unknown app address", { status: 403 });
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.set("x-sennibook-desktop", token);
    if (headers.has("origin")) headers.set("origin", origin);
    const response = await net.fetch(origin + url.pathname + url.search, {
      method: request.method,
      headers,
      body: request.body,
      ...(request.body ? { duplex: "half" } : {}),
    });
    const resultHeaders = new Headers(response.headers);
    resultHeaders.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: resultHeaders,
    });
  });
  window = new BrowserWindow({
    title: "LMBook",
    width: 1400,
    height: 940,
    minWidth: 700,
    minHeight: 560,
    autoHideMenuBar: true,
    // Keep native Windows caption buttons, but paint them into the app surface
    // so the dark system title bar no longer clashes with the light canvas.
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#00000000", symbolColor: "#223b34", height: 44 },
    backgroundColor: "#f5f6f2",
    show: false,
    icon: path.join(root, "electron", "icon.png"),
    webPreferences: {
      preload: path.join(root, "electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });
  downloads = createDownloadManager({
    getWindow: () => window,
    getOrigin: () => origin,
    token,
    showSaveDialog: (owner, options) => dialog.showSaveDialog(owner, options),
    onProgress: (info) => {
      if (!window || window.isDestroyed()) return;
      window.webContents.send("desktop:download-progress", info);
    },
  });
  const ses = window.webContents.session;
  ses.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  ses.setPermissionCheckHandler(() => false);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      void requestQuit();
    }
  });
  window.once("ready-to-show", () => {
    if (!process.env.SENNIBOOK_TEST_HIDDEN) window.show();
  });
  ipcMain.handle("desktop:info", (event) => {
    verifySender(event);
    return {
      version: app.getVersion(),
      platform: process.platform,
      dataPath: path.join(userData, "data"),
      configPath: path.join(userData, ".env"),
    };
  });
  ipcMain.handle("desktop:open-data", (event) => {
    verifySender(event);
    return shell.openPath(path.join(userData, "data"));
  });
  ipcMain.handle("desktop:copy-text", (event, text) => {
    verifySender(event);
    if (typeof text !== "string" || text.length > 12000)
      throw new Error("Clipboard text is too long.");
    clipboard.writeText(text);
  });
  ipcMain.handle("desktop:download", (event, input) => {
    verifySender(event);
    return downloads.download(input);
  });
  ipcMain.handle("desktop:download-cancel", (event, id) => {
    verifySender(event);
    return downloads.cancelDownload(id);
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "LMBook",
        submenu: [
          { label: "Show LMBook", click: showWindow },
          {
            label: "Open data folder",
            click: () => shell.openPath(path.join(userData, "data")),
          },
          { type: "separator" },
          {
            label: "Quit LMBook",
            accelerator: "CmdOrCtrl+Q",
            click: () => void requestQuit(),
          },
        ],
      },
      { role: "editMenu" },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { role: "togglefullscreen" },
          ...(!app.isPackaged ? [{ role: "toggleDevTools" }] : []),
        ],
      },
    ]),
  );
  // Keep native window controls and menu accelerators without a second bar.
  // Alt temporarily reveals the menu on Windows/Linux.
  window.setMenuBarVisibility(false);
  tray = new Tray(
    nativeImage.createFromPath(path.join(root, "electron", "icon.png")),
  );
  tray.setToolTip("LMBook");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open LMBook", click: showWindow },
      { label: "Quit LMBook", click: () => void requestQuit() },
    ]),
  );
  tray.on("double-click", showWindow);
  let pollingActivity = false;
  async function updateActivity() {
    if (pollingActivity || quitting) return;
    pollingActivity = true;
    try {
      const response = await fetch(origin + "/api/status", {
        headers: { "x-sennibook-desktop": token },
        signal: AbortSignal.timeout(4000),
      });
      const status = await response.json();
      if (quitting || !backend) return;
      activeJobs = Object.keys(status.activeJobs || {}).length;
      tray?.setToolTip(
        activeJobs
          ? `LMBook · ${activeJobs} active task${activeJobs === 1 ? "" : "s"}`
          : "LMBook",
      );
      if (activeJobs && blocker === undefined)
        blocker = powerSaveBlocker.start("prevent-app-suspension");
      if (!activeJobs && blocker !== undefined) {
        powerSaveBlocker.stop(blocker);
        blocker = undefined;
      }
    } catch {
    } finally {
      pollingActivity = false;
    }
  }
  poll = setInterval(updateActivity, 2000);
  await window.loadURL(appOrigin);
  void updateActivity();
}
app.on("second-instance", showWindow);
app.on("activate", showWindow);
app.on("window-all-closed", () => {
  if (quitting) app.quit();
});
let shutdownStarted = false;
async function finishShutdown() {
  clearInterval(poll);
  if (blocker !== undefined && powerSaveBlocker.isStarted(blocker))
    powerSaveBlocker.stop(blocker);
  tray?.destroy();
  tray = undefined;
  // A download owns a temporary file and an open response body. Abort and
  // await those operations before the backend is torn down so no partial
  // file is mistaken for a completed export.
  if (downloads) {
    await Promise.race([
      downloads.cancelAll(),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
  }
  const worker = backend;
  if (!worker) {
    app.exit(0);
    return;
  }
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      worker.kill();
      resolve();
    }, 15000);
    worker.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    worker.postMessage({ type: "shutdown" });
  });
  app.exit(0);
}
app.on("before-quit", (event) => {
  if (!quitting) {
    event.preventDefault();
    void requestQuit();
    return;
  }
  event.preventDefault();
  if (shutdownStarted) return;
  shutdownStarted = true;
  void finishShutdown();
});
if (!hasLock) app.quit();
else
  app
    .whenReady()
    .then(setup)
    .catch((error) => {
      log(error.stack || error.message);
      if (!process.env.SENNIBOOK_TEST_HIDDEN)
        dialog.showErrorBox(
          "LMBook could not start",
          `${error.message}\n\nDetails: ${logPath}`,
        );
      quitting = true;
      app.quit();
    });
