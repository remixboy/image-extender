// Image Extender — desktop wrapper.
//
// What this does, in plain words:
//   1. Starts the app's built-in web server quietly in the background.
//   2. Waits until it answers.
//   3. Opens a normal app window that shows it.
// When you close the window, the server is shut down too.

const { app, BrowserWindow, dialog, shell, utilityProcess } = require('electron');
const path = require('path');
const http = require('http');

// Keep this number FIXED. Your OpenRouter key is saved in the app's storage,
// and that storage is tied to this exact address. Changing the port = the
// app "forgets" your key.
const PORT = 31337;
const HOST = '127.0.0.1';
const APP_URL = `http://${HOST}:${PORT}`;

let server = null;
let serverLog = '';
let serverExited = false;
let quitting = false;
let win = null;

function serverDir() {
  // In the packaged app the server lives in Resources/next-server.
  // (Running unpackaged is only for testing; it needs .next/static copied in by hand.)
  return app.isPackaged
    ? path.join(process.resourcesPath, 'next-server')
    : path.join(__dirname, '..', '.next', 'standalone');
}

function startServer() {
  const dir = serverDir();
  server = utilityProcess.fork(path.join(dir, 'server.js'), [], {
    cwd: dir,
    stdio: 'pipe',
    serviceName: 'Image Extender server',
    env: {
      ...process.env,
      PORT: String(PORT),
      HOSTNAME: HOST, // only reachable from this computer, not the network
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  });

  const keep = (chunk) => {
    serverLog = (serverLog + chunk.toString()).slice(-4000);
  };
  if (server.stdout) server.stdout.on('data', keep);
  if (server.stderr) server.stderr.on('data', keep);

  server.on('exit', (code) => {
    serverExited = true;
    // If the server dies while the window is open, say so instead of showing a blank window.
    if (!quitting && win) {
      dialog.showErrorBox(
        'Image Extender stopped',
        `The built-in server stopped unexpectedly (code ${code}).\n\n${serverLog}`
      );
      app.quit();
    }
  });
}

function ping() {
  return new Promise((resolve) => {
    const req = http.get(APP_URL, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end && !serverExited) {
    if (await ping()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function isAppUrl(url) {
  return url.startsWith(APP_URL) || url.startsWith('blob:') || url.startsWith('data:') || url === 'about:blank';
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: 'Image Extender',
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    show: false,
  });
  win.once('ready-to-show', () => win.show());

  // Links to other websites (like openrouter.ai/keys) open in your normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) return { action: 'allow' };
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  win.on('closed', () => {
    win = null;
  });
  win.loadURL(APP_URL);
}

async function main() {
  startServer();
  const ok = await waitForServer();
  if (!ok) {
    dialog.showErrorBox(
      'Image Extender could not start',
      `The built-in server did not answer on ${APP_URL}.\n` +
        `Another program might be using port ${PORT}.\n\n${serverLog}`
    );
    app.quit();
    return;
  }
  createWindow();
}

// Only allow one copy of the app at a time (two copies would fight over the port).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(main);
}

app.on('before-quit', () => {
  quitting = true;
  if (server && !serverExited) server.kill();
});

// Closing the window quits the app (on Mac too), which also stops the server.
app.on('window-all-closed', () => app.quit());
