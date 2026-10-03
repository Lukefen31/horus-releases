// Horus for the desktop: the club app in its own window. The window loads the
// live product over HTTPS (so the app is always the deployed version, with
// the service worker's offline fallback), keeps navigation inside horus.farm
// (anything else opens in the system browser), and gives the app a proper
// menu, icon and window state. No Node integration reaches the page.
const { app, BrowserWindow, Menu, shell, session, nativeTheme } = require("electron");
const path = require("node:path");

const SITE = "https://horus.farm";
const START = `${SITE}/club`;
const ALLOWED_HOSTS = new Set(["horus.farm", "www.horus.farm"]);

app.setAppUserModelId("farm.horus.desktop");

function isOurs(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#09110F" : "#F1F6F3",
    title: "Horus",
    icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  win.once("ready-to-show", () => win.show());
  win.loadURL(START);

  // Stay on the product; everything else goes to the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isOurs(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!isOurs(url) && !url.startsWith("mailto:")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  win.webContents.on("did-fail-load", (_e, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3: aborted by a newer navigation
    win.loadFile(path.join(__dirname, "offline.html"), { query: { url } });
  });
  return win;
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const nav = (label, p) => ({ label, click: (_i, win) => win?.webContents.loadURL(`${SITE}${p}`) });
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "Horus",
      submenu: [
        nav("Overview", "/club"),
        nav("Counter", "/club/counter"),
        nav("Members", "/club/members"),
        nav("Grow", "/club/grow"),
        nav("Lots", "/club/lots"),
        nav("Reports", "/club/reports"),
        { type: "separator" },
        nav("Security", "/club/security"),
        { label: "Sign out", click: (_i, win) => win?.webContents.executeJavaScript('(()=>{const f=document.querySelector(\'form[action="/club/auth/sign-out"]\');if(f){f.submit();return true}location.href="/club/sign-in";return false})()') },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "forceReload" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: "horus.farm", click: () => shell.openExternal(SITE) },
        { label: "Member portal", click: () => shell.openExternal(`${SITE}/portal`) },
        { label: "Email hello@horus.farm", click: () => shell.openExternal("mailto:hello@horus.farm") },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  // Permissions: nothing the product doesn't use.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(["notifications", "clipboard-read", "clipboard-sanitized-write"].includes(permission));
  });
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
