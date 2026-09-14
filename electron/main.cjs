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

app.setName("SenniBook");
if (process.env.SENNIBOOK_USER_DATA)
  app.setPath("userData", path.resolve(process.env.SENNIBOOK_USER_DATA));
const hasLock = app.requestSingleInstanceLock();
let window, backend, tray, origin, poll, blocker;
let quitting = false,
  closePrompt = false,
  activeJobs = 0;
const token = randomBytes(32).toString("hex");
const root = app.getAppPath();
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
      /* Keep the last known state if the service is temporarily unavailable. */
    }
  }
  if (activeJobs) {
    closePrompt = true;
    const result = await dialog.showMessageBox(window, {
      type: "question",
      title: "Generation is still running",
      message: "Keep your episode generation running?",
      detail:
        "You can leave SenniBook in the system tray. Quitting cancels active work; completed chapters remain saved.",
      buttons: [
        "Keep working in background",
        "Stay in SenniBook",
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
        serviceName: "SenniBook learning engine",
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
            "SenniBook needs to restart",
            "The learning engine stopped unexpectedly. Completed work is saved. Reopen SenniBook to continue.\n\nLog: " +
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
    title: "SenniBook",
    width: 1400,
    height: 940,
    minWidth: 700,
    minHeight: 560,
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
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "SenniBook",
        submenu: [
          { label: "Show SenniBook", click: showWindow },
          {
            label: "Open data folder",
            click: () => shell.openPath(path.join(userData, "data")),
          },
          { type: "separator" },
          {
            label: "Quit SenniBook",
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
  tray = new Tray(
    nativeImage.createFromPath(path.join(root, "electron", "icon.png")),
  );
  tray.setToolTip("SenniBook");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open SenniBook", click: showWindow },
      { label: "Quit SenniBook", click: () => void requestQuit() },
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
          ? `SenniBook · ${activeJobs} active task${activeJobs === 1 ? "" : "s"}`
          : "SenniBook",
      );
      if (activeJobs && blocker === undefined)
        blocker = powerSaveBlocker.start("prevent-app-suspension");
      if (!activeJobs && blocker !== undefined) {
        powerSaveBlocker.stop(blocker);
        blocker = undefined;
      }
    } catch {
      /* A transient status failure should not stop generation. */
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
app.on("before-quit", (event) => {
  if (!quitting) {
    event.preventDefault();
    void requestQuit();
    return;
  }
  if (backend) {
    event.preventDefault();
    if (shutdownStarted) return;
    shutdownStarted = true;
    clearInterval(poll);
    if (blocker !== undefined && powerSaveBlocker.isStarted(blocker))
      powerSaveBlocker.stop(blocker);
    tray?.destroy();
    tray = undefined;
    const worker = backend;
    const timer = setTimeout(() => {
      worker.kill();
      app.exit(0);
    }, 15000);
    worker.once("exit", () => {
      clearTimeout(timer);
      app.exit(0);
    });
    worker.postMessage({ type: "shutdown" });
  }
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
          "SenniBook could not start",
          `${error.message}\n\nDetails: ${logPath}`,
        );
      quitting = true;
      app.quit();
    });
