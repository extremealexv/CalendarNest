@echo off
REM FamSync Kiosk Setup Script for Windows Development

echo ============================================
echo  FamSync Kiosk Development Setup (Windows)
echo ============================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed.
    echo Please install Node.js from https://nodejs.org/
    echo Make sure to install the LTS version.
    pause
    exit /b 1
)

REM Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm is not installed.
    echo This should come with Node.js installation.
    pause
    exit /b 1
)

REM Display Node.js and npm versions
echo [INFO] Checking Node.js installation...
node --version
npm --version
echo.

REM Install dependencies
echo [INFO] Installing project dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)

REM Create .env file if it doesn't exist
if not exist .env (
    echo [INFO] Creating .env file from template...
    copy .env.example .env
    echo [WARNING] Please edit .env file with your API keys before running the application
    echo.
)

REM Build the React application
echo [INFO] Building React application...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to build application.
    pause
    exit /b 1
)

REM Create development batch files
echo [INFO] Creating development shortcuts...

echo @echo off > start-dev.bat
echo echo Starting FamSync in development mode... >> start-dev.bat
echo call npm start >> start-dev.bat
echo pause >> start-dev.bat

echo @echo off > start-electron.bat
echo echo Starting FamSync with Electron... >> start-electron.bat
echo call npm run electron-dev >> start-electron.bat
echo pause >> start-electron.bat

echo @echo off > build-dist.bat
echo echo Building FamSync for distribution... >> build-dist.bat
echo call npm run dist >> build-dist.bat
echo echo Build completed! Check the dist folder. >> build-dist.bat
echo pause >> build-dist.bat

echo.
echo ============================================
echo  Setup completed successfully! 🎉
echo ============================================
echo.
echo Next steps:
echo 1. Edit .env file with your Google Calendar API keys
echo 2. Get API credentials from Google Cloud Console:
echo    - Go to https://console.cloud.google.com/
echo    - Create a project or select existing one
echo    - Enable Google Calendar API
echo    - Create OAuth 2.0 credentials
echo    - Add http://localhost:3000/auth/callback to authorized redirect URIs
echo.
echo Development commands:
echo - start-dev.bat     : Start React development server
echo - start-electron.bat: Start Electron development mode
echo - build-dist.bat    : Build for production
echo.
echo Manual commands:
echo - npm start         : Start React dev server
echo - npm run electron-dev : Start Electron + React
echo - npm run dist      : Build for production
echo.
pause