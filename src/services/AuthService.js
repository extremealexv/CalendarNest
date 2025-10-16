// Authentication Service for FamSync Kiosk
import { googleCalendarService } from './GoogleCalendarService';

class AuthService {
  constructor() {
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    try {
      await googleCalendarService.loadStoredAccounts();
      this.isInitialized = true;
    } catch (err) {
      console.error('Failed to initialize auth service', err);
    }
  }

  async checkExistingAuth() {
    await this.initialize();
    return googleCalendarService.getAccounts();
  }

  // Start PKCE-based auth flow, open auth window via preload API
  async startAuthentication(accountHint = '') {
    await this.initialize();
    try {
      const authUrl = await googleCalendarService.getAuthUrl(accountHint);

      if (window.electronAPI && typeof window.electronAPI.openAuthWindow === 'function') {
        const result = await window.electronAPI.openAuthWindow(authUrl);
        if (result && result.code) {
          const account = await googleCalendarService.authenticateWithCode(result.code);
          return account;
        }
        throw new Error('Authentication failed or cancelled');
      } else {
        // Web fallback using popup
        const popup = window.open(authUrl, 'google-auth', 'width=600,height=700');
        return new Promise((resolve, reject) => {
          const interval = setInterval(() => {
            try {
              if (popup.closed) {
                clearInterval(interval);
                reject(new Error('Authentication cancelled'));
              }
            } catch (e) {}
          }, 500);

          window.addEventListener('message', async function onMessage(event) {
            if (event.origin !== window.location.origin) return;
            if (event.data && event.data.type === 'GOOGLE_AUTH_SUCCESS') {
              window.removeEventListener('message', onMessage);
              clearInterval(interval);
              popup.close();
              try {
                const account = await googleCalendarService.authenticateWithCode(event.data.code);
                resolve(account);
              } catch (err) {
                reject(err);
              }
            }
          });
        });
      }
    } catch (err) {
      console.error('startAuthentication error', err);
      throw err;
    }
  }

  async logout(accountId) {
    try {
      googleCalendarService.removeAccount(accountId);
      return true;
    } catch (err) {
      console.error('Logout failed', err);
      throw err;
    }
  }

  async logoutAll() {
    try {
      const accounts = googleCalendarService.getAccounts();
      for (const acc of accounts) await this.logout(acc.id);
      return true;
    } catch (err) {
      console.error('logoutAll failed', err);
      throw err;
    }
  }

  getAuthenticatedAccounts() {
    return googleCalendarService.getAccounts();
  }

  isAuthenticated() {
    return this.getAuthenticatedAccounts().length > 0;
  }

  async refreshTokens(accountId) {
    try {
      return await googleCalendarService.refreshTokenIfNeeded(accountId);
    } catch (err) {
      console.error('refreshTokens failed', err);
      return false;
    }
  }
}

export const authService = new AuthService();
export { AuthService };