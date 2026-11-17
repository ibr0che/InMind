// Desktop shell: runs the Express server in this process and shows the built
// client in a window. Run `npm run desktop` (builds first) or `npm run desktop:open`.
import { app, BrowserWindow, shell } from "electron";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const PORT = 3017; // not 3001, so it can run alongside `npm run dev`
const ORIGIN = `http://127.0.0.1:${PORT}`;

// dotenv reads .env from the working directory; launching from a shortcut
// may start elsewhere, so pin it to the project root.
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
process.env.PORT = String(PORT);
process.env.HOST = "127.0.0.1";
process.env.SERVE_CLIENT = "1";

// Gives InMind its own taskbar identity, so it isn't grouped as "Electron".
app.setAppUserModelId("InMind.Journal");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win;

  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    const { server } = await import("../server/index.js");
    if (!server.listening) await once(server, "listening");

    win = new BrowserWindow({
      width: 1200,
      height: 820,
      minWidth: 380,
      minHeight: 500,
      backgroundColor: "#111111",
      autoHideMenuBar: true,
      title: "InMind",
      icon: fileURLToPath(new URL("icon.ico", import.meta.url)),
      webPreferences: { contextIsolation: true, sandbox: true },
    });

    // Links to other sites open in the normal browser, not inside the app.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("http")) shell.openExternal(url);
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (event, url) => {
      if (!url.startsWith(ORIGIN)) {
        event.preventDefault();
        shell.openExternal(url);
      }
    });

    win.loadURL(ORIGIN);
  });

  app.on("window-all-closed", () => app.quit());
}
