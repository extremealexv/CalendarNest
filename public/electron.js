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
  // Determine start URL / file (try several locations when packaged)
  const startUrl = isDev ? 'http://localhost:3000' : null;

  if (isDev) {
    console.log('Loading dev url:', startUrl);
    mainWindow.loadURL(startUrl);
  } else {
    // Try several likely places for the built index.html
    const candidates = [
      path.join(__dirname, '../build/index.html'),
      path.join(__dirname, 'build', 'index.html'),
      path.join(process.resourcesPath || '', 'app', 'build', 'index.html'),
      path.join(process.resourcesPath || '', 'build', 'index.html')
    ];

    let found = null;
    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) { found = c; break; }
      } catch (e) {}
    }

    if (found) {
      const fileUrl = `file://${found}`;
      console.log('Loading production file URL:', fileUrl);
      mainWindow.loadURL(fileUrl).catch(err => {
        console.error('Failed to load production file URL:', fileUrl, err);
      });
    } else {
      console.error('No build index.html found. Tried:', candidates);
      // Show a small fallback page so users know something went wrong
      const msg = encodeURIComponent('<h1>FamSync</h1><p>Application failed to start: index.html not found.</p>');
      mainWindow.loadURL(`data:text/html,${msg}`);
    }
  }

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

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('Failed to load URL:', validatedURL, 'errorCode:', errorCode, 'isMainFrame:', isMainFrame, 'Error:', errorDescription);
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
    try {
      // If opening externally on linux try to show OS keyboard to help with login forms
      if (process.platform === 'linux') tryStartOsKeyboard();
    } catch (e) { console.debug('show OS keyboard attempt failed for external link', e); }
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

      // If we're on Linux, try to show the OS virtual keyboard so users can type into external auth flows
      try {
        if (process.platform === 'linux') {
          console.log('Attempting to show OS virtual keyboard for auth window');
          tryStartOsKeyboard();
        }
      } catch (e) { console.error('show OS keyboard attempt failed', e); }

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
        try {
          // hide OS keyboard when auth window closes
          tryHideOsKeyboard();
        } catch (e) { console.debug('Error hiding OS keyboard on authWindow close', e); }
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

// Save account metadata (e.g., nickname) merged with tokens file
ipcMain.handle('save-account-meta', async (event, { accountId, meta }) => {
  try {
    const all = readTokensFile();
    if (!all[accountId]) all[accountId] = {};
    all[accountId].meta = { ...(all[accountId].meta || {}), ...(meta || {}) };
    writeTokensFile(all);
    return { success: true };
  } catch (err) {
    console.error('save-account-meta failed', err);
    return { success: false, error: String(err) };
  }
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

// Track an OS keyboard process so we can show/hide it when needed
let osKeyboardProc = null;
const tryStartOsKeyboard = () => {
  const { spawn } = require('child_process');
  if (osKeyboardProc && !osKeyboardProc.killed) return osKeyboardProc;
  const candidates = [
    { cmd: 'onboard', args: [] },
    { cmd: 'matchbox-keyboard', args: [] },
    { cmd: 'florence', args: [] }
  ];
  for (const c of candidates) {
    try {
      const p = spawn(c.cmd, c.args, { detached: true, stdio: 'ignore' });
      p.unref();
      osKeyboardProc = p;
      console.log('Launched OS keyboard:', c.cmd);
      return osKeyboardProc;
    } catch (e) {
      // try next
      console.log('Failed to launch', c.cmd, e && e.message);
    }
  }
  // As a fallback, try to use 'xdg-open' to open onboard if present via desktop entry
  try {
    const p2 = spawn('onboard', [], { detached: true, stdio: 'ignore' });
    p2.unref();
    osKeyboardProc = p2;
    return osKeyboardProc;
  } catch (e) {}
  return null;
};

const tryHideOsKeyboard = () => {
  try {
    if (osKeyboardProc && !osKeyboardProc.killed) {
      try { process.kill(-osKeyboardProc.pid); } catch (e) { try { osKeyboardProc.kill(); } catch (ee) {} }
      osKeyboardProc = null;
      console.log('OS keyboard process killed');
      return true;
    }
    // fallback: try pkill common keyboard processes
    const { spawnSync } = require('child_process');
    spawnSync('pkill', ['-f', 'onboard']);
    spawnSync('pkill', ['-f', 'matchbox-keyboard']);
    spawnSync('pkill', ['-f', 'florence']);
    return true;
  } catch (e) {
    console.error('tryHideOsKeyboard error', e);
    return false;
  }
};

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

// Expose show/hide OS keyboard via IPC so renderer can request it when needed
ipcMain.handle('show-os-keyboard', async () => {
  try {
    const p = tryStartOsKeyboard();
    return { success: !!p };
  } catch (e) {
    console.error('show-os-keyboard failed', e);
    return { success: false, error: String(e) };
  }
});

ipcMain.handle('hide-os-keyboard', async () => {
  try {
    const ok = tryHideOsKeyboard();
    return { success: !!ok };
  } catch (e) {
    console.error('hide-os-keyboard failed', e);
    return { success: false, error: String(e) };
  }
});

// Allow renderer to write a diagnostic message into the main log (userData)
ipcMain.handle('renderer-log', async (event, { message }) => {
  try {
    const logPath = path.join(app.getPath('userData'), 'renderer.log');
    const line = new Date().toISOString() + ' ' + (String(message) || '') + '\n';
    try { fs.appendFileSync(logPath, line, 'utf8'); } catch (e) { /* ignore */ }
    console.log('[renderer-log]', message);
    return { success: true };
  } catch (e) {
    console.error('renderer-log failed', e);
    return { success: false, error: String(e) };
  }
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
// TTS: speak-text handler uses espeak/pico2wave + sox (optional) + aplay to provide reliable audio
ipcMain.handle('speak-text', async (event, { text, lang = 'en' }) => {
  return new Promise((resolve) => {
    try {
      if (!text) return resolve({ success: false, error: 'No text provided' });

      // Sanitize text: strip asterisks and collapse whitespace
      const sanitized = ('' + text).replace(/\*/g, '').replace(/\s+/g, ' ').trim();

      const logPath = path.join(app.getPath('userData'), 'tts.log');
      const tmpLogPath = '/tmp/famsync-tts.log';
      try { console.log('TTS logs will be written to:', logPath, 'and', tmpLogPath); } catch (e) {}
      const writeLog = (msg) => {
        const line = new Date().toISOString() + ' ' + msg + '\n';
        try { fs.appendFileSync(logPath, line, 'utf8'); } catch (e) { /* ignore */ }
        try { fs.appendFileSync(tmpLogPath, line, 'utf8'); } catch (e) { /* ignore */ }
      };

      writeLog('TTS start: ' + sanitized.slice(0, 500));

      // Estimate duration
      const wordCount = sanitized.split(/\s+/).filter(Boolean).length;
      const estimatedMs = Math.ceil((wordCount / 2.5) * 1000);
      const timeoutMs = Math.min(Math.max(estimatedMs + 3000, 5000), 2 * 60 * 1000);
      writeLog('TTS words=' + wordCount + ' estimatedMs=' + estimatedMs + ' timeoutMs=' + timeoutMs);

      const { spawn, spawnSync } = require('child_process');
      const device = 'plughw:2,0';
      const tmpFile = path.join('/tmp', `famsync_tts_${Date.now()}.wav`);
      const normFile = tmpFile.replace('.wav', '_norm.wav');

      // Choose engine: prefer RHVoice for Russian, then pico2wave, then espeak
      let engineUsed = 'espeak';
      try {
        // Prefer RHVoice for Russian if available (higher quality)
        const whichRh = spawnSync('which', ['RHVoice-test']);
        if ((String(lang) || '').toLowerCase().startsWith('ru') && whichRh.status === 0) {
          engineUsed = 'rhvoice';
        } else {
          const whichPico = spawnSync('which', ['pico2wave']);
          if (whichPico.status === 0) engineUsed = 'pico2wave';
        }
      } catch (e) {
        engineUsed = 'espeak';
      }
      writeLog('TTS engine chosen: ' + engineUsed + ' lang=' + lang);

      let settled = false;
      const settle = (result) => {
        if (settled) return;
        settled = true;
        try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (e) { writeLog('tmp unlink failed: ' + String(e)); }
        try { if (fs.existsSync(normFile)) fs.unlinkSync(normFile); } catch (e) { /* ignore */ }
        writeLog('TTS end: ' + JSON.stringify(result));
        resolve(result);
      };

      const doPlay = (file, rate, channels) => {
        const aplayArgs = ['-q', '-f', 'S16_LE', '-r', String(rate), '-c', String(channels), '-D', device, file];
        writeLog('aplay args: ' + JSON.stringify(aplayArgs));
        const aplay = spawn('aplay', aplayArgs);
        aplay.on('error', (err) => { writeLog('aplay spawn error: ' + String(err)); return settle({ success: false, error: String(err) }); });
        let stderr = '';
        aplay.stderr.on('data', d => { stderr += d.toString(); writeLog('aplay stderr: ' + d.toString()); });
        aplay.on('close', (acode) => { if (acode === 0) return settle({ success: true }); return settle({ success: false, error: 'aplay exited with code ' + acode + ' stderr: ' + stderr }); });
        setTimeout(() => { if (!settled) settle({ success: true, timeout: true }); }, timeoutMs);
      };

      const playback = () => {
        const soxArgs = [tmpFile, '-r', '44100', '-c', '2', normFile, 'norm'];
        writeLog('sox args: ' + JSON.stringify(soxArgs));
        try {
          const sox = spawn('sox', soxArgs);
          let soxFailed = false;
          sox.on('error', (err) => { writeLog('sox spawn error: ' + String(err)); soxFailed = true; });
          sox.stderr.on('data', d => writeLog('sox stderr: ' + d.toString()));
          sox.on('close', (scode) => {
            if (scode !== 0) { writeLog('sox exited with code: ' + scode); soxFailed = true; }
            if (!soxFailed) return doPlay(normFile, 44100, 2);
            writeLog('sox not available or failed, falling back to raw espeak WAV. To enable normalization install sox: sudo apt-get install sox libsox-fmt-all');
            return doPlay(tmpFile, 22050, 1);
          });
        } catch (err) {
          writeLog('sox handling exception: ' + String(err));
          return doPlay(tmpFile, 22050, 1);
        }
      };

      const generate = () => {
        if (engineUsed === 'rhvoice') {
          // Prefer streaming via FIFO to start playback as soon as data is available
          const fifo = path.join('/tmp', `famsync_tts_fifo_${Date.now()}.wav`);
          writeLog('Attempting FIFO streaming via: ' + fifo);
          try {
            // create FIFO
            try { if (fs.existsSync(fifo)) fs.unlinkSync(fifo); } catch (e) {}
            const mk = spawnSync('mkfifo', [fifo]);
            if (mk.status === 0) {
              writeLog('mkfifo succeeded');
              // start aplay reading from FIFO
              const aplayArgs = ['-q', '-D', device, fifo];
              writeLog('aplay fifo args: ' + JSON.stringify(aplayArgs));
              const aplayProc = spawn('aplay', aplayArgs);
              aplayProc.on('error', (err) => { writeLog('aplay fifo spawn error: ' + String(err)); });

              // spawn RHVoice to write to fifo
              const rhArgs = ['-p', 'Elena', '-o', fifo];
              writeLog('RHVoice fifo args: ' + JSON.stringify(rhArgs));
              const rh = spawn('RHVoice-test', rhArgs);
              rh.on('error', (err) => { writeLog('RHVoice fifo spawn error: ' + String(err)); });
              try { rh.stdin.write(sanitized); rh.stdin.end(); } catch (werr) { writeLog('RHVoice stdin write failed: ' + String(werr)); }

              rh.on('close', (code) => {
                writeLog('RHVoice fifo closed with code: ' + code);
                // wait for aplay to finish
                aplayProc.on('close', () => {
                  try { if (fs.existsSync(fifo)) fs.unlinkSync(fifo); } catch (e) {}
                  playback(); // still run normalization/playback path (will fallback if sox missing)
                });
              });
              return;
            } else {
              writeLog('mkfifo failed, falling back to file generation: ' + JSON.stringify(mk));
            }
          } catch (err) {
            writeLog('FIFO streaming exception: ' + String(err));
          }

          // Fallback: write to tmp file then playback
          const rhArgs = ['-p', 'Elena', '-o', tmpFile];
          writeLog('RHVoice file args: ' + JSON.stringify(rhArgs));
          try {
            const rh = spawn('RHVoice-test', rhArgs);
            rh.on('error', (err) => { writeLog('RHVoice spawn error: ' + String(err)); engineUsed = 'espeak'; generate(); });
            try { rh.stdin.write(sanitized); rh.stdin.end(); } catch (werr) { writeLog('RHVoice stdin write failed: ' + String(werr)); }
            rh.on('close', (code) => { if (code !== 0) { writeLog('RHVoice exited with code: ' + code); engineUsed = 'espeak'; generate(); return; } playback(); });
          } catch (err) {
            writeLog('RHVoice handling exception: ' + String(err));
            engineUsed = 'espeak';
            generate();
          }
        } else if (engineUsed === 'pico2wave') {
          const picoArgs = ['-w', tmpFile, sanitized];
          writeLog('pico2wave args: ' + JSON.stringify(picoArgs));
          const pico = spawn('pico2wave', picoArgs);
          pico.on('error', (err) => { writeLog('pico2wave spawn error: ' + String(err)); engineUsed = 'espeak'; generate(); });
          pico.on('close', (code) => { if (code !== 0) { writeLog('pico2wave exited with code: ' + code); engineUsed = 'espeak'; generate(); return; } playback(); });
        } else {
          // Tune espeak voice per language
          const isRussian = ('' + lang).toLowerCase().startsWith('ru');
          const espeakArgs = isRussian
            ? ['-v', 'ru', '-s', '120', '-a', '160', '-w', tmpFile, sanitized]
            : ['-v', 'en-us+f3', '-s', '130', '-a', '160', '-w', tmpFile, sanitized];
          writeLog('espeak args: ' + JSON.stringify(espeakArgs));
          const espeak = spawn('espeak', espeakArgs);
          espeak.on('error', (err) => { writeLog('espeak spawn error: ' + String(err)); return settle({ success: false, error: String(err) }); });
          espeak.on('close', (code) => { if (code !== 0) { writeLog('espeak exited with code: ' + code); return settle({ success: false, error: 'espeak exited ' + code }); } playback(); });
        }
      };

      generate();
    } catch (err) {
      try { fs.appendFileSync(path.join(app.getPath('userData'), 'tts.log'), new Date().toISOString() + ' speak-text internal: ' + String(err) + '\n', 'utf8'); } catch (e) {}
      return resolve({ success: false, error: String(err) });
    }
  });
});
