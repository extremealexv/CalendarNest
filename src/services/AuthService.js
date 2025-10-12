// Authentication Service for FamSync Kiosk
import { googleCalendarService } from './GoogleCalendarService';

class AuthService {
  constructor() {
    this.isInitialized = false;
  }

  // Initialize the auth service
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Load existing accounts from storage
      googleCalendarService.loadStoredAccounts();
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize auth service:', error);
    }
  }

  // Check for existing authentication
  async checkExistingAuth() {
    await this.initialize();
    return googleCalendarService.getAccounts();
  }

  // Start OAuth2 authentication flow
  async startAuthentication(accountHint = '') {
    await this.initialize();
    
    try {
      const authUrl = googleCalendarService.getAuthUrl(accountHint);
      
      // In Electron, open the auth URL in a new window
      if (window.electronAPI) {
        return await window.electronAPI.openAuthWindow(authUrl);
      } else {
        // For web development, open in popup
        const popup = window.open(
          authUrl,
          'google-auth',
          'width=600,height=700,scrollbars=yes,resizable=yes'
        );
        
        return new Promise((resolve, reject) => {
          const checkClosed = setInterval(() => {
            if (popup.closed) {
              clearInterval(checkClosed);
              reject(new Error('Authentication was cancelled'));
            }
          }, 1000);

          // Listen for the auth code from the popup
          window.addEventListener('message', (event) => {
            if (event.origin !== window.location.origin) return;
            
            if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
              clearInterval(checkClosed);
              popup.close();
              resolve(event.data.code);
            } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
              clearInterval(checkClosed);
              popup.close();
              reject(new Error(event.data.error));
            }
          });
        });
      }
    } catch (error) {
      console.error('Authentication failed:', error);
      throw new Error('Failed to start authentication');
    }
  }

  // Complete authentication with authorization code
  async completeAuthentication(authorizationCode) {
    try {
      const accountData = await googleCalendarService.authenticateWithCode(authorizationCode);
      return accountData;
    } catch (error) {
      console.error('Failed to complete authentication:', error);
      throw new Error('Authentication failed');
    }
  }

  // Logout specific account
  async logout(accountId) {
    try {
      googleCalendarService.removeAccount(accountId);
      return true;
    } catch (error) {
      console.error('Logout failed:', error);
      throw new Error('Failed to logout');
    }
  }

  // Logout all accounts
  async logoutAll() {
    try {
      const accounts = googleCalendarService.getAccounts();
      for (const account of accounts) {
        await this.logout(account.id);
      }
      return true;
    } catch (error) {
      console.error('Failed to logout all accounts:', error);
      throw new Error('Failed to logout all accounts');
    }
  }

  // Get current authenticated accounts
  getAuthenticatedAccounts() {
    return googleCalendarService.getAccounts();
  }

  // Check if user is authenticated
  isAuthenticated() {
    const accounts = this.getAuthenticatedAccounts();
    return accounts.length > 0;
  }

  // Refresh authentication tokens
  async refreshTokens(accountId) {
    try {
      return await googleCalendarService.refreshTokenIfNeeded(accountId);
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }
}

export const authService = new AuthService();
export { AuthService };