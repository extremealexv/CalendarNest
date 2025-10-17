const { app, BrowserWindow, ipcMain, shell } = require('electron');
const isDev = require('electron-is-dev');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Load environment variables from the appropriate location
function loadEnvFile() {
  const envPaths = [
    // Explicit local project .env for the Orange Pi deployment
    '/home/orangepi/CalendarNest/.env',
    path.join(os.homedir(), '.config', 'famsync', '.env'),  // User config directory (preferred)
    path.join('/opt/famsync', '.env'),                      // Installation directory
    path.join(process.cwd(), '.env'),                       // Current working directory
    path.join(app.getPath('userData'), '.env')              // Electron user data directory
  ];

  for (const envPath of envPaths) {
    try {
      if (fs.existsSync(envPath)) {
        // Try using dotenv if available. If it's not bundled in the AppImage,
        // fall back to a simple parser so the app can still load environment vars.
        try {
          require('dotenv').config({ path: envPath });
          console.log('Loaded environment from (dotenv):', envPath);
          return envPath;
        } catch (dotErr) {
          try {
            const raw = fs.readFileSync(envPath, 'utf8');
            raw.split(/\r?\n/).forEach(line => {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith('#')) return;
              const eq = trimmed.indexOf('=');
              if (eq === -1) return;
              const key = trimmed.slice(0, eq).trim();
              let val = trimmed.slice(eq + 1).trim();
              // Remove surrounding quotes
              if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
              }
              if (key && process.env[key] === undefined) process.env[key] = val;
            });
            console.log('Loaded environment from (manual):', envPath);
            return envPath;
          } catch (readErr) {
            console.error('Error reading .env from', envPath, ':', readErr);
          }
        }
      }
    } catch (error) {
      console.error('Error loading .env from', envPath, ':', error);
    }
  }
  console.warn('No .env file found in any of the search paths');
  return null;
}

// Load environment variables before app initialization
const _envLoadedFrom = loadEnvFile();
if (_envLoadedFrom) {
  console.log('Environment loaded from:', _envLoadedFrom);
} else {
  console.log('Environment not loaded from file');
}

// TOKENS_PATH is declared later after app paths are available; avoid referencing it before initialization

// Configure app for ARM devices
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('enable-logging');
app.commandLine.appendSwitch('v', '1');

// Handle D-Bus environment
if (process.env.DBUS_SESSION_BUS_ADDRESS) {
    app.commandLine.appendSwitch('force-device-scale-factor', '1');
    console.log('D-Bus session found:', process.env.DBUS_SESSION_BUS_ADDRESS);
} else {
    console.log('No D-Bus session found');
}

let mainWindow;

function createWindow() {
  // Create the browser window for kiosk mode
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      enableRemoteModule: false,
      webSecurity: false, // Allow local file access for development
      offscreen: false // Ensure standard rendering mode
    },
    // Kiosk mode settings
    fullscreen: !isDev, // Only fullscreen in production
    kiosk: !isDev, // Only kiosk mode in production  
    autoHideMenuBar: true,
    frame: false,
    resizable: isDev, // Allow resize in development
    movable: isDev,
    minimizable: isDev,
    maximizable: isDev,
    closable: isDev
  });

  // Load the app
  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, '../build/index.html')}`;
  
  mainWindow.loadURL(startUrl);

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Prevent navigation away from the app
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    console.log('Navigating to URL:', navigationUrl);

    if (parsedUrl.origin !== startUrl && !parsedUrl.origin.includes('accounts.google.com')) {
      console.error('Blocked navigation to:', navigationUrl);
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load URL:', validatedURL, 'Error:', errorDescription);
  });

  // Temporarily enable web security for testing
  mainWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    console.log('Request details:', details);
    callback({ cancel: false });
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow Google OAuth popup
    if (url.includes('accounts.google.com') || url.includes('oauth')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 600,
          height: 700,
          modal: true,
          parent: mainWindow,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
          }
        }
      };
    }
    
    // Block all other external links in kiosk mode
    if (!isDev) {
      return { action: 'deny' };
    }
    
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App event handlers
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for calendar operations
ipcMain.handle('get-calendar-data', async (event, accountId) => {
  // This will be implemented with Google Calendar API
  return { events: [], calendars: [] };
});

ipcMain.handle('create-calendar-event', async (event, eventData) => {
  // This will be implemented with Google Calendar API
  return { success: true, eventId: 'temp-id' };
});

ipcMain.handle('authenticate-google', async (event, authCode) => {
  // This will be implemented with OAuth2 flow
  return { success: true, tokens: {} };
});

// Auto-start in kiosk mode on Ubuntu
if (process.platform === 'linux' && !isDev) {
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath
  });
}

// Token storage helpers (simple JSON file in userData)
const TOKENS_PATH = path.join(app.getPath('userData'), 'famsync_tokens.json');

function readTokensFile() {
  try {
    if (fs.existsSync(TOKENS_PATH)) {
      const raw = fs.readFileSync(TOKENS_PATH, 'utf8');
      return JSON.parse(raw || '{}');
    }
  } catch (err) {
    console.error('Failed to read tokens file:', err);
  }
  return {};
}

function writeTokensFile(data) {
  try {
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to write tokens file:', err);
    return false;
  }
}

// IPC: Open auth window and capture redirect (PKCE-friendly)
ipcMain.handle('open-auth-window', async (event, authUrl) => {
  // Accept either a string (old API) or an object { authUrl, serverId }
  return new Promise((resolve, reject) => {
    try {
      let url = authUrl;
      let serverId = null;
      if (authUrl && typeof authUrl === 'object') {
        url = authUrl.authUrl;
        serverId = authUrl.serverId || null;
      }

      const authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        modal: true,
        parent: mainWindow,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      // Associate authWindow with loopback server entry if provided
      if (serverId && loopbackServers.has(String(serverId))) {
        const entry = loopbackServers.get(String(serverId));
        entry.authWindow = authWindow;
        loopbackServers.set(String(serverId), entry);
      }

      authWindow.loadURL(url);

      // We don't attempt to capture the redirect here when using loopback URIs
      // because the loopback server will receive the request. Still listen for
      // navigation events to detect direct redirects that match a configured
      // REACT_APP_GOOGLE_REDIRECT_URI (legacy fallback).
      // Track whether the promise has been settled to avoid double resolve/reject
      let settled = false;
      const handleNavigation = (newUrl) => {
        try {
          const parsed = new URL(newUrl);
          const redirectUri = process.env.REACT_APP_GOOGLE_REDIRECT_URI || '';
          if (redirectUri && newUrl.startsWith(redirectUri)) {
            const code = parsed.searchParams.get('code');
            const error = parsed.searchParams.get('error');
            if (code) {
              if (!settled) { settled = true; resolve({ code }); }
            } else {
              if (!settled) { settled = true; reject(new Error(error || 'No code in redirect')); }
            }
            try { authWindow.close(); } catch (e) {}
          }
        } catch (err) {
          // ignore parse errors for other navigations
        }
      };

      authWindow.webContents.on('will-redirect', (event, url) => {
        handleNavigation(url);
      });

      authWindow.webContents.on('did-navigate', (event, url) => {
        handleNavigation(url);
      });

      authWindow.on('closed', () => {
        if (!settled) {
          settled = true;
          reject(new Error('Auth window closed'));
        }
      });
    } catch (err) {
      reject(err);
    }
  });
});

// IPC: token storage
ipcMain.handle('save-tokens', async (event, { accountId, tokens }) => {
  const all = readTokensFile();
  all[accountId] = tokens;
  return writeTokensFile(all);
});

ipcMain.handle('get-tokens', async (event, { accountId }) => {
  const all = readTokensFile();
  return all[accountId] || null;
});

ipcMain.handle('remove-tokens', async (event, { accountId }) => {
  const all = readTokensFile();
  delete all[accountId];
  return writeTokensFile(all);
});

ipcMain.handle('list-accounts', async () => {
  const all = readTokensFile();
  return Object.keys(all);
});

// Exchange auth code for tokens in main process (avoids CORS)
ipcMain.handle('exchange-auth-code', async (event, { code, codeVerifier, redirectUri }) => {
  try {
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const params = new URLSearchParams();
    params.append('client_id', process.env.REACT_APP_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '');
    const clientSecret = process.env.REACT_APP_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
    if (clientSecret) params.append('client_secret', clientSecret);
    params.append('code', code);
    params.append('code_verifier', codeVerifier || '');
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', redirectUri || process.env.REACT_APP_GOOGLE_REDIRECT_URI || '');

    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const json = await resp.json();
    if (!resp.ok) {
      throw new Error(JSON.stringify(json));
    }

    return { success: true, tokens: json };
  } catch (err) {
    console.error('exchange-auth-code failed', err);
    return { success: false, error: String(err) };
  }
});

// Loopback server manager
const http = require('http');
const loopbackServers = new Map(); // serverId -> { server, port, resolver }
let nextLoopbackId = 1;

ipcMain.handle('create-loopback-server', async () => {
  const id = String(nextLoopbackId++);
  return new Promise((resolve, reject) => {
    try {
      const server = http.createServer((req, res) => {
        try {
          const urlObj = new URL(req.url, `http://127.0.0.1`);
          const code = urlObj.searchParams.get('code');
          const state = urlObj.searchParams.get('state');
          // respond with a small HTML page that tells the user they can close
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h2>You can close this window and return to the app.</h2></body></html>');

          const entry = loopbackServers.get(id);
          if (entry && entry.resolve) entry.resolve({ code, state });
          // If an authWindow was attached to this loopback server, close it
          try {
            if (entry && entry.authWindow && !entry.authWindow.isDestroyed()) {
              entry.authWindow.close();
            }
          } catch (e) {
            console.error('Failed to close authWindow for loopback server', e);
          }
        } catch (err) {
          console.error('Loopback request handling error', err);
        }
      });

      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        loopbackServers.set(id, { server, port, resolve: null });
        resolve({ serverId: id, port, redirectUri: `http://127.0.0.1:${port}/callback` });
      });
    } catch (err) {
      reject(err);
    }
  });
});

ipcMain.handle('wait-auth-code', async (event, { serverId }) => {
  const entry = loopbackServers.get(String(serverId));
  if (!entry) throw new Error('No such loopback server');

  return new Promise((resolve, reject) => {
    entry.resolve = (payload) => {
      try {
        resolve(payload);
      } finally {
        try { entry.server.close(); } catch (e) {}
        loopbackServers.delete(String(serverId));
      }
    };

    // Timeout after 2 minutes
    setTimeout(() => {
      if (entry.resolve) {
        entry.resolve = null;
        try { entry.server.close(); } catch (e) {}
        loopbackServers.delete(String(serverId));
        reject(new Error('Auth wait timed out'));
      }
    }, 2 * 60 * 1000);
  });
});

// Refresh auth tokens in main process (avoids CORS and allows client_secret)
ipcMain.handle('refresh-auth-token', async (event, { refreshToken }) => {
  try {
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const params = new URLSearchParams();
    params.append('client_id', process.env.REACT_APP_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '');
    const clientSecret = process.env.REACT_APP_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
    if (clientSecret) params.append('client_secret', clientSecret);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken || '');

    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const json = await resp.json();
    if (!resp.ok) {
      throw new Error(JSON.stringify(json));
    }

    return { success: true, tokens: json };
  } catch (err) {
    console.error('refresh-auth-token failed', err);
    return { success: false, error: String(err) };
  }
});