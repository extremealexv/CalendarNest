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
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
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