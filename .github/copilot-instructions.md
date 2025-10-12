# Copilot Instructions for FamSync Kiosk

## Project Overview
FamSync is a React + Electron kiosk application for family calendar management. The project structure includes:

- **Frontend**: React components in `src/components/` with calendar views (Month/Week/Day)
- **Services**: API integrations in `src/services/` (Google Calendar, Auth, QR Code, Gemini AI)
- **Electron**: Kiosk mode wrapper in `public/electron.js` for Ubuntu touchscreen deployment
- **Build System**: npm scripts for development and Linux distribution

## Architecture & Key Components

### Authentication Flow
- **AuthService**: Manages OAuth2 Google Calendar authentication
- **QRCodeService**: Handles QR code generation/scanning for mobile auth
- Multiple account support with token management in localStorage

### Calendar System  
- **GoogleCalendarService**: Core Google Calendar API integration
- **CalendarView**: Main component orchestrating Month/Week/Day views
- **Event Management**: Creation, editing, conflict detection across multiple accounts

### Kiosk Features
- **Touch-friendly UI**: Large buttons, hover effects optimized for touchscreens
- **Security**: Restricted navigation, disabled context menus, fullscreen mode
- **Auto-start**: System integration for Ubuntu kiosk deployment

## Development Workflow

### Prerequisites Setup
1. **Node.js Installation Required**: `npm install` to get dependencies
2. **Environment Config**: Copy `.env.example` to `.env` and configure:
   - Google Calendar API credentials (OAuth2)
   - Gemini API key (optional, for natural language)
   - Kiosk mode settings

### Development Commands
```bash
npm start           # React dev server
npm run electron-dev # Electron + React development
npm run dist-linux  # Build Ubuntu AppImage
```

### Component Patterns
- **Touch Targets**: Minimum 44px buttons, hover/active states
- **Account Colors**: Consistent color coding across views (account-1 through account-6 classes)
- **Event Display**: Gradient backgrounds with border-left indicators
- **Responsive**: Mobile-first with kiosk-optimized breakpoints

## Key Integration Points

### Google Calendar API
- **Multiple Accounts**: Each user maintains separate OAuth2 tokens
- **Event Sync**: Bi-directional sync with conflict detection
- **Free/Busy**: Availability overlay across all connected calendars

### Electron Kiosk Mode
- **Security**: `webSecurity: false` for dev, `kiosk: true` for production
- **Window Management**: Fullscreen, no frame, restricted navigation
- **Ubuntu Integration**: Auto-start service configuration

### Natural Language (Gemini)
- **Event Creation**: "Schedule lunch with mom tomorrow at 1pm"
- **Availability Queries**: "Who's free this weekend?"
- **Conflict Resolution**: Smart scheduling suggestions

## File Structure Conventions
```
src/
├── components/     # React UI components
├── services/      # API and utility services  
├── App.js         # Main app orchestration
└── index.css      # Global touch-friendly styles

public/
├── electron.js    # Electron main process
└── index.html     # Kiosk-optimized HTML

```

## Development Notes
- **Missing Dependencies**: Run `npm install` when Node.js is available
- **API Keys**: Required for Google Calendar and optional for Gemini AI
- **Testing**: Electron dev mode allows window resize/devtools
- **Production**: Kiosk mode disables all system access and navigation

## When Adding Features
- Maintain touch-friendly design patterns (44px minimum targets)
- Use account color coding for multi-user clarity  
- Add error handling for offline scenarios (kiosk reliability)
- Follow OAuth2 security best practices for token handling

---
_Last updated: 2025-10-12. Now contains full React + Electron implementation._
