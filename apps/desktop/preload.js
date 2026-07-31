const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("proberxDesktop", {
  platform: process.platform,
  version: "1.0.0",
});
