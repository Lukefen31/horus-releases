// Runs before the page, isolated from it. Nothing is exposed to the page: the
// product is a normal website and needs no desktop APIs. The flag below lets
// the site tell it is inside the desktop app (it hides its own "Install app"
// links, the same way it does inside the phone shells).
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("HorusDesktop", { version: process.versions.electron, platform: process.platform });
