# FamSync Kiosk - Family Calendar Application

A React + Electron kiosk application for managing family calendars with multiple Google account integration, QR code authentication, and natural language scheduling.

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ and npm
- Google Cloud Console project with Calendar API enabled
- Gemini API key (optional, for natural language features)

### Installation

1. **Clone and Install Dependencies**
```bash
git clone https://github.com/extremealexv/CalendarNest.git
cd CalendarNest
npm install
```

2. **Environment Setup**
```bash
cp .env.example .env
```

3. **Configure Google Calendar API**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable Google Calendar API
   - Create OAuth 2.0 credentials (Web application)
   - Add authorized redirect URIs: `http://localhost:3000/auth/callback`
   - Copy Client ID and Client Secret to `.env` file

4. **Configure Gemini API (Optional)**
   - Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Add to `.env` file

### Development

```bash
# Start React development server
npm start

# Start Electron in development mode
npm run electron-dev
```

### Production Build

```bash
# Build for Linux (Ubuntu)
npm run dist-linux

# Build for all platforms
npm run dist
```

## 🏗️ Architecture

### Frontend (React)
- **Components**: Modular UI components for calendar views and authentication
- **Services**: Google Calendar API integration, QR code handling, Gemini AI
- **Views**: Month/Week/Day calendar displays with touch-friendly interface

### Backend Integration
- **Google Calendar API**: OAuth2 authentication and calendar operations
- **Gemini AI**: Natural language event creation and scheduling
- **Local Storage**: Account credentials and app preferences

### Electron Wrapper
- **Kiosk Mode**: Full-screen application for touchscreen displays
- **Security**: Restricted navigation and external link handling
- **Auto-start**: System integration for Ubuntu kiosk deployment

## 🔧 Configuration

### Environment Variables
```bash
# Required
REACT_APP_GOOGLE_CLIENT_ID=your_client_id
REACT_APP_GOOGLE_CLIENT_SECRET=your_client_secret

# Optional
REACT_APP_GEMINI_API_KEY=your_gemini_key
REACT_APP_KIOSK_MODE=true  # Enable kiosk mode
```

### Ubuntu Kiosk Setup
1. Install the application: `sudo dpkg -i famsync-kiosk_1.0.0_amd64.deb`
2. Configure auto-start: `sudo systemctl enable famsync-kiosk`
3. Set up touchscreen calibration if needed

## 📱 Features

### Multi-Account Authentication
- OAuth2 Google account integration
- QR code login for easy mobile authentication
- Account switching and management

### Calendar Views
- **Month View**: Full month overview with event previews
- **Week View**: Detailed weekly schedule with time slots
- **Day View**: Hour-by-hour daily schedule

### Event Management
- Create events with participant selection
- Sync across all connected Google calendars
- Availability checking and conflict detection
- Recurring event support

### Smart Features
- **Natural Language**: "Schedule lunch with mom tomorrow at 1pm"
- **Availability Overlay**: Visual indicators for free/busy times
- **Conflict Detection**: Automatic scheduling conflict warnings

### Kiosk Optimizations
- Touch-friendly interface with large buttons
- Auto-hide cursor after inactivity
- Restricted navigation for public use
- Offline caching for reliability

## 🔐 Security

### Authentication
- OAuth2 secure token handling
- Local credential encryption
- Automatic token refresh

### Kiosk Mode
- Disabled right-click context menus
- Restricted external navigation
- No access to system functions

### Privacy
- Local data storage only
- No cloud analytics or tracking
- Optional privacy mode for sensitive events

## 🛠️ Development

### Project Structure
```
src/
├── components/          # React UI components
│   ├── CalendarView/   # Calendar display components
│   ├── Auth/           # Authentication screens
│   └── Common/         # Shared UI components
├── services/           # API and utility services
│   ├── GoogleCalendarService.js
│   ├── AuthService.js
│   ├── QRCodeService.js
│   └── GeminiService.js
└── utils/              # Helper functions
```

### Key Services
- **GoogleCalendarService**: Calendar API operations
- **AuthService**: OAuth2 authentication flow
- **QRCodeService**: QR code generation and scanning
- **GeminiService**: Natural language processing

### Testing
```bash
npm test                # Run test suite
npm run test:coverage   # Generate coverage report
```

## 📦 Deployment

### Ubuntu Kiosk Deployment
1. **Build Application**: `npm run dist-linux`
2. **Install on Target**: Copy `.deb` file to Ubuntu system
3. **Configure Kiosk**: Set up auto-boot and touchscreen
4. **Network Setup**: Ensure internet access for Google API calls

### Docker Deployment
```bash
# Build container
docker build -t famsync-kiosk .

# Run with display forwarding
docker run -e DISPLAY=$DISPLAY famsync-kiosk
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: Report bugs on GitHub Issues
- **Documentation**: Check the `/docs` folder for detailed guides
- **Community**: Join discussions in GitHub Discussions

## 🚧 Roadmap

- [ ] Multi-language support
- [ ] Voice commands integration
- [ ] Advanced recurring event patterns
- [ ] Calendar sharing and permissions
- [ ] Mobile companion app
- [ ] Advanced analytics and insights