const { app, BrowserWindow, ipcMain, shell } = require('electron');
const isDev = require('electron-is-dev');
const path = require('path');

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
      webSecurity: false // Allow local file access for development
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
    
    if (parsedUrl.origin !== startUrl && !parsedUrl.origin.includes('accounts.google.com')) {
      event.preventDefault();
    }
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