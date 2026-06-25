// Electron 主进程 —— 知学伴桌面应用
const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { createServer } = require("http");
const { parse } = require("url");

let mainWindow;

// 直接加载已构建好的 Next.js 服务（用 next 模块而非 CLI）
async function createWindow() {
  const appDir = __dirname;
  const port = 3456;

  // 启动 Next.js 自定义服务器
  const nextApp = require("next")({
    dev: false,
    dir: appDir,
    port,
    hostname: "127.0.0.1",
  });

  try {
    await nextApp.prepare();
    const handle = nextApp.getRequestHandler();

    const server = createServer((req, res) => {
      handle(req, res, parse(req.url, true));
    });

    server.listen(port, "127.0.0.1", () => {
      console.log(`知学伴服务已启动: http://127.0.0.1:${port}`);

      mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "知学伴",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
        autoHideMenuBar: true,
      });

      mainWindow.loadURL(`http://127.0.0.1:${port}`);

      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
      });

      mainWindow.on("closed", () => { mainWindow = null; });
    });

    server.on("error", (err) => {
      console.error("服务启动失败:", err);
      app.quit();
    });
  } catch (err) {
    console.error("Next.js 启动失败:", err);
    app.quit();
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});
