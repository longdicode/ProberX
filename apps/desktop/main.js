const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, shell } = require("electron");
const path = require("path");

// ProberX 远程地址
const PROBERX_URL = "https://agent.yqone.cn";

let mainWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: "ProberX - 服务器监控",
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    // 隐藏默认菜单栏
    autoHideMenuBar: true,
  });

  // 加载远程 ProberX 面板
  mainWindow.loadURL(PROBERX_URL);

  // 拦截外部链接用默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(PROBERX_URL)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  // 创建 16x16 托盘图标
  const iconPath = path.join(__dirname, "assets", "tray-icon.png");
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip("ProberX - 服务器监控");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "显示主窗口",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    {
      label: "打开 Web 面板",
      click: () => shell.openExternal(PROBERX_URL),
    },
    { type: "separator" },
    {
      label: "关于 ProberX",
      click: () => {
        dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "关于 ProberX",
          message: "ProberX 桌面客户端",
          detail: `版本: ${app.getVersion()}\n一款现代化的服务器监控运维平台\n支持实时监控、告警、WebSSH、AI 终端等功能`,
        });
      },
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// 应用就绪
app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

// 防止多实例
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Windows/Linux: 不退出，保持托盘
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});
