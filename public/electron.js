const { app, BrowserWindow, ipcMain, shell } = require('electron');
const isDev = require('electron-is-dev');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Load environment variables from the appropriate location
function loadEnvFile() {
  const envPaths = [
    path.join(os.homedir(), '.config', 'famsync', '.env'),  // User config directory (preferred)
    path.join('/opt/famsync', '.env'),                      // Installation directory
    path.join(process.cwd(), '.env'),                       // Current working directory
    path.join(app.getPath('userData'), '.env')              // Electron user data directory
  ];

  for (const envPath of envPaths) {
    try {
      if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
        console.log('Loaded environment from:', envPath);
        return true;
      }
    } catch (error) {
      console.error('Error loading .env from', envPath, ':', error);
    }
  }
  console.warn('No .env file found in any of the search paths');
  return false;
}

// Load environment variables before app initialization
loadEnvFile();

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
  return new Promise((resolve, reject) => {
    try {
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

      authWindow.loadURL(authUrl);

      const handleNavigation = (newUrl) => {
        try {
          const parsed = new URL(newUrl);
          // If the redirect URI matches our app's configured redirect, capture code
          const redirectUri = process.env.REACT_APP_GOOGLE_REDIRECT_URI || '';
          if (redirectUri && newUrl.startsWith(redirectUri)) {
            const code = parsed.searchParams.get('code');
            const error = parsed.searchParams.get('error');
            if (code) {
              resolve({ code });
            } else {
              reject(new Error(error || 'No code in redirect'));
            }
            authWindow.close();
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
        reject(new Error('Auth window closed'));
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
ipcMain.handle('exchange-auth-code', async (event, { code, codeVerifier }) => {
  try {
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const params = new URLSearchParams();
    params.append('client_id', process.env.REACT_APP_GOOGLE_CLIENT_ID || '');
    params.append('code', code);
    params.append('code_verifier', codeVerifier || '');
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', process.env.REACT_APP_GOOGLE_REDIRECT_URI || '');

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