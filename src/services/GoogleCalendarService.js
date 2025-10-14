// Google Calendar API Integration for FamSync Kiosk (Browser Compatible)
import { gapi } from 'gapi-script';

class GoogleCalendarService {
  constructor() {
    this.isGapiLoaded = false;
    this.accounts = new Map(); // Store multiple authenticated accounts
    this.currentAuth = null;
  }

  // Initialize Google API client for browser
  async initializeGapi() {
    if (this.isGapiLoaded) return true;

    try {
      console.log('Starting Google API initialization...');

      await new Promise((resolve, reject) => {
        gapi.load('auth2:client', {
          callback: resolve,
          onerror: (error) => {
            console.error('Failed to load gapi:', error);
            reject(error);
          }
        });
      });

      console.log('gapi loaded successfully. Initializing client...');

      if (!gapi.auth2) {
        throw new Error('auth2 module is missing in gapi. Ensure the Google API client is configured correctly.');
      }

      await gapi.client.init({
        apiKey: process.env.REACT_APP_GOOGLE_API_KEY,
        clientId: process.env.REACT_APP_GOOGLE_CLIENT_ID,
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
        scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events'
      });

      console.log('Google API client initialized successfully.');

      this.currentAuth = gapi.auth2.getAuthInstance();
      console.log('Auth instance:', this.currentAuth);

      if (!this.currentAuth || typeof this.currentAuth.getAuthUrl !== 'function') {
        throw new Error('gapi.auth2.getAuthInstance returned an invalid object');
      }

      this.isGapiLoaded = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize Google API:', error);
      return false;
    }
  }

  // Start authentication flow
  async startAuthentication() {
    await this.initializeGapi();
    
    try {
      const authResponse = await this.currentAuth.signIn();
      const profile = authResponse.getBasicProfile();
      const authResult = authResponse.getAuthResponse(true);

      const accountData = {
        id: profile.getId(),
        email: profile.getEmail(),
        name: profile.getName(),
        picture: profile.getImageUrl(),
        accessToken: authResult.access_token,
        idToken: authResult.id_token,
        authenticatedAt: new Date().toISOString()
      };

      this.accounts.set(accountData.id, accountData);
      this.saveAccountToStorage(accountData);
      
      return accountData;
    } catch (error) {
      console.error('Authentication failed:', error);
      throw new Error('Failed to authenticate with Google');
    }
  }

  // Exchange authorization code for tokens
  async authenticateWithCode(authorizationCode) {
    try {
      if (!this.oauth2Client) {
        this.initializeOAuth2();
      }

      const { tokens } = await this.oauth2Client.getToken(authorizationCode);
      this.oauth2Client.setCredentials(tokens);

      // Get user info
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const { data: userInfo } = await oauth2.userinfo.get();

      // Store account information
      const accountData = {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        tokens: tokens,
        authenticatedAt: new Date().toISOString()
      };

      this.accounts.set(userInfo.id, accountData);

      // Store in localStorage for persistence
      const existingAccounts = JSON.parse(localStorage.getItem('famsync_accounts') || '[]');
      const updatedAccounts = existingAccounts.filter(acc => acc.id !== userInfo.id);
      updatedAccounts.push(accountData);
      localStorage.setItem('famsync_accounts', JSON.stringify(updatedAccounts));

      return accountData;
    } catch (error) {
      console.error('Authentication error:', error);
      throw new Error('Failed to authenticate with Google');
    }
  }

  // Load stored accounts from localStorage
  loadStoredAccounts() {
    try {
      const storedAccounts = JSON.parse(localStorage.getItem('famsync_accounts') || '[]');
      storedAccounts.forEach(account => {
        this.accounts.set(account.id, account);
      });
      return storedAccounts;
    } catch (error) {
      console.error('Failed to load stored accounts:', error);
      return [];
    }
  }

  // Set up OAuth2 client for specific account
  setAccountAuth(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    if (!this.oauth2Client) {
      this.initializeOAuth2();
    }

    this.oauth2Client.setCredentials(account.tokens);
    return account;
  }

  // Refresh access token if needed
  async refreshTokenIfNeeded(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) return false;

    try {
      this.setAccountAuth(accountId);
      
      // Check if token is expired (simplified check)
      if (account.tokens.expiry_date && Date.now() >= account.tokens.expiry_date) {
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        
        // Update stored tokens
        account.tokens = credentials;
        this.accounts.set(accountId, account);
        
        // Update localStorage
        const storedAccounts = this.loadStoredAccounts();
        const updatedAccounts = storedAccounts.map(acc => 
          acc.id === accountId ? account : acc
        );
        localStorage.setItem('famsync_accounts', JSON.stringify(updatedAccounts));
      }
      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }

  // Get calendar list for an account
  async getCalendars(accountId) {
    try {
      await this.refreshTokenIfNeeded(accountId);
      this.setAccountAuth(accountId);

      const response = await this.calendar.calendarList.list();
      return response.data.items || [];
    } catch (error) {
      console.error('Failed to get calendars:', error);
      throw new Error('Failed to fetch calendars');
    }
  }

  // Get events for a specific date range and account
  async getEvents(accountId, startDate, endDate) {
    try {
      await this.refreshTokenIfNeeded(accountId);
      this.setAccountAuth(accountId);

      const account = this.accounts.get(accountId);
      
      // Calculate date range (default to current month if not provided)
      const start = startDate || new Date();
      start.setDate(1); // First day of month
      
      const end = endDate || new Date(start);
      end.setMonth(end.getMonth() + 1); // First day of next month

      const calendars = await this.getCalendars(accountId);
      const allEvents = [];

      // Fetch events from all calendars
      for (const calendar of calendars) {
        try {
          const response = await this.calendar.events.list({
            calendarId: calendar.id,
            timeMin: start.toISOString(),
            timeMax: end.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 250
          });

          const events = (response.data.items || []).map(event => ({
            ...event,
            accountId: accountId,
            accountEmail: account.email,
            accountName: account.name,
            calendarId: calendar.id,
            calendarName: calendar.summary,
            backgroundColor: calendar.backgroundColor || '#4285f4'
          }));

          allEvents.push(...events);
        } catch (calendarError) {
          console.warn(`Failed to fetch events from calendar ${calendar.summary}:`, calendarError);
        }
      }

      return allEvents;
    } catch (error) {
      console.error('Failed to get events:', error);
      throw new Error('Failed to fetch events');
    }
  }

  // Create a new event
  async createEvent(eventData) {
    try {
      const { accountId, calendarId = 'primary', ...eventDetails } = eventData;
      
      await this.refreshTokenIfNeeded(accountId);
      this.setAccountAuth(accountId);

      const response = await this.calendar.events.insert({
        calendarId: calendarId,
        resource: eventDetails
      });

      return response.data;
    } catch (error) {
      console.error('Failed to create event:', error);
      throw new Error('Failed to create event');
    }
  }

  // Update an existing event
  async updateEvent(eventData) {
    try {
      const { accountId, eventId, calendarId = 'primary', ...eventDetails } = eventData;
      
      await this.refreshTokenIfNeeded(accountId);
      this.setAccountAuth(accountId);

      const response = await this.calendar.events.update({
        calendarId: calendarId,
        eventId: eventId,
        resource: eventDetails
      });

      return response.data;
    } catch (error) {
      console.error('Failed to update event:', error);
      throw new Error('Failed to update event');
    }
  }

  // Delete an event
  async deleteEvent(accountId, calendarId = 'primary', eventId) {
    try {
      await this.refreshTokenIfNeeded(accountId);
      this.setAccountAuth(accountId);

      await this.calendar.events.delete({
        calendarId: calendarId,
        eventId: eventId
      });

      return true;
    } catch (error) {
      console.error('Failed to delete event:', error);
      throw new Error('Failed to delete event');
    }
  }

  // Get free/busy information for availability checking
  async getFreeBusy(accountIds, startTime, endTime) {
    try {
      const freeBusyData = {};

      for (const accountId of accountIds) {
        await this.refreshTokenIfNeeded(accountId);
        this.setAccountAuth(accountId);

        const calendars = await this.getCalendars(accountId);
        const calendarItems = calendars.map(cal => ({ id: cal.id }));

        const response = await this.calendar.freebusy.query({
          resource: {
            timeMin: startTime.toISOString(),
            timeMax: endTime.toISOString(),
            items: calendarItems
          }
        });

        freeBusyData[accountId] = response.data;
      }

      return freeBusyData;
    } catch (error) {
      console.error('Failed to get free/busy information:', error);
      throw new Error('Failed to check availability');
    }
  }

  // Remove account authentication
  removeAccount(accountId) {
    this.accounts.delete(accountId);
    
    // Remove from localStorage
    const storedAccounts = JSON.parse(localStorage.getItem('famsync_accounts') || '[]');
    const updatedAccounts = storedAccounts.filter(acc => acc.id !== accountId);
    localStorage.setItem('famsync_accounts', JSON.stringify(updatedAccounts));
  }

  // Get all authenticated accounts
  getAccounts() {
    return Array.from(this.accounts.values());
  }
}

export const googleCalendarService = new GoogleCalendarService();
export { GoogleCalendarService };