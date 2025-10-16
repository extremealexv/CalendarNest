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
      // Use loopback server flow: create server, open auth URL, wait for code
      const { authUrl, serverId } = await googleCalendarService.createAuthWithLoopback(accountHint);

      // Open the auth URL in a window (for Electron we prefer main open)
      if (window.electronAPI && typeof window.electronAPI.openAuthWindow === 'function') {
        // open a window pointing to the auth page
        await window.electronAPI.openAuthWindow(authUrl);
      } else {
        window.open(authUrl, 'google-auth', 'width=600,height=700');
      }

      // Wait for the loopback server to receive the auth code
      const result = await window.electronAPI.waitForAuthCode(serverId);
      if (!result || !result.code) throw new Error('Authentication failed or timed out');

      // Complete auth exchange
      const account = await googleCalendarService.authenticateWithCode(result.code);
      return account;
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