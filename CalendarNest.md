# FamSync: Family Calendar Kiosk App

## 🧩 Problem Statement
Managing schedules across multiple Google Calendar accounts is chaotic for families. Visibility is limited, especially when someone can’t access their device. This leads to missed events and constant coordination overhead.

## 💡 Solution
A touchscreen kiosk app running on Ubuntu Linux that aggregates all family calendars, shows availability, and allows event creation with participant selection. Events sync back to individual Google Calendars.

## 🖥️ Platform
- Microcomputer (e.g., Raspberry Pi 4 or Intel NUC)
- Ubuntu Linux
- LED Touchscreen
- Kiosk mode (auto-launch full-screen app)

## 🔧 Tech Stack
- **Frontend**: React + Electron (or Flutter)
- **Backend**: Python (FastAPI or Flask)
- **Calendar API**: Google Calendar API (OAuth2)
- **Smart Assistant**: Google Gemini API 
- **Dev Tools**: VSCode + GitHub Copilot

## 🔐 Authentication
- OAuth2 flow for each Google account
- QR code login for ease of use
- Token refresh and secure storage

## 📅 Features
- Month / Week / Day views
- Color-coded events per user
- Availability overlay (heatmap or icons)
- Event creation with participant selector
- Recurrence, reminders, location
- Bi-directional sync with Google Calendar
- Offline caching and retry logic

## 🧠 Gemini Integration 
- Natural language event creation
- “Who’s free this weekend?” summaries
- Conflict detection and suggestions
- Voice assistant for queries and scheduling

## 🎁 Bonus Features
- QR Code login (user must be able to authenticate using multiple accounts)
- Presence detection (motion sensor or camera)
- Privacy mode (hide sensitive events)
- Family mode toggle
- Smart notifications
- Touch-friendly UI with kiosk auto-launch

