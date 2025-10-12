// QR Code Service for FamSync Kiosk Authentication
import QRCode from 'qrcode';
import jsQR from 'jsqr';

class QRCodeService {
  constructor() {
    this.authSessions = new Map(); // Store temporary auth sessions
  }

  // Generate QR code for authentication
  async generateAuthQR(sessionId = null) {
    try {
      // Create unique session ID if not provided
      const authSessionId = sessionId || this.generateSessionId();
      
      // Create auth URL with session ID
      const authData = {
        type: 'famsync_auth',
        sessionId: authSessionId,
        timestamp: Date.now(),
        expires: Date.now() + (10 * 60 * 1000), // 10 minutes expiry
        authUrl: this.getAuthUrlForQR(authSessionId)
      };

      // Store session
      this.authSessions.set(authSessionId, {
        ...authData,
        status: 'pending'
      });

      // Generate QR code
      const qrDataUrl = await QRCode.toDataURL(JSON.stringify(authData), {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });

      return {
        qrCode: qrDataUrl,
        sessionId: authSessionId,
        expires: authData.expires
      };
    } catch (error) {
      console.error('Failed to generate QR code:', error);
      throw new Error('Failed to generate authentication QR code');
    }
  }

  // Generate QR code for quick account switching
  async generateAccountSwitchQR(accountId) {
    try {
      const switchData = {
        type: 'famsync_switch',
        accountId: accountId,
        timestamp: Date.now()
      };

      const qrDataUrl = await QRCode.toDataURL(JSON.stringify(switchData), {
        width: 200,
        margin: 1,
        color: {
          dark: '#2196F3',
          light: '#FFFFFF'
        }
      });

      return qrDataUrl;
    } catch (error) {
      console.error('Failed to generate account switch QR:', error);
      throw new Error('Failed to generate account switch QR code');
    }
  }

  // Generate session ID
  generateSessionId() {
    return 'fs_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  }

  // Get authentication URL for QR code
  getAuthUrlForQR(sessionId) {
    const baseUrl = process.env.REACT_APP_BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/auth/qr/${sessionId}`;
  }

  // Scan and process QR code from camera
  async scanQRCode(imageData, canvas) {
    try {
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      
      if (code) {
        return await this.processQRData(code.data);
      }
      
      return null;
    } catch (error) {
      console.error('QR code scan failed:', error);
      return null;
    }
  }

  // Process QR code data
  async processQRData(qrData) {
    try {
      const data = JSON.parse(qrData);
      
      switch (data.type) {
        case 'famsync_auth':
          return await this.handleAuthQR(data);
        case 'famsync_switch':
          return await this.handleSwitchQR(data);
        default:
          throw new Error('Invalid QR code type');
      }
    } catch (error) {
      console.error('Failed to process QR data:', error);
      throw new Error('Invalid QR code');
    }
  }

  // Handle authentication QR code
  async handleAuthQR(authData) {
    try {
      // Check if session exists and is valid
      const session = this.authSessions.get(authData.sessionId);
      
      if (!session) {
        throw new Error('Invalid or expired session');
      }

      if (Date.now() > authData.expires) {
        this.authSessions.delete(authData.sessionId);
        throw new Error('QR code has expired');
      }

      // Mark session as scanned
      session.status = 'scanned';
      session.scannedAt = Date.now();
      
      return {
        type: 'auth',
        sessionId: authData.sessionId,
        authUrl: authData.authUrl,
        success: true
      };
    } catch (error) {
      console.error('Auth QR handling failed:', error);
      throw error;
    }
  }

  // Handle account switch QR code
  async handleSwitchQR(switchData) {
    try {
      return {
        type: 'switch',
        accountId: switchData.accountId,
        success: true
      };
    } catch (error) {
      console.error('Switch QR handling failed:', error);
      throw error;
    }
  }

  // Check auth session status
  getAuthSessionStatus(sessionId) {
    const session = this.authSessions.get(sessionId);
    
    if (!session) {
      return { status: 'not_found' };
    }

    if (Date.now() > session.expires) {
      this.authSessions.delete(sessionId);
      return { status: 'expired' };
    }

    return {
      status: session.status,
      sessionId: sessionId,
      scannedAt: session.scannedAt
    };
  }

  // Complete auth session
  completeAuthSession(sessionId, accountData) {
    const session = this.authSessions.get(sessionId);
    
    if (session) {
      session.status = 'completed';
      session.completedAt = Date.now();
      session.accountData = accountData;
      
      // Clean up session after 5 minutes
      setTimeout(() => {
        this.authSessions.delete(sessionId);
      }, 5 * 60 * 1000);
      
      return true;
    }
    
    return false;
  }

  // Start camera for QR scanning
  async startCamera(videoElement) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      videoElement.srcObject = stream;
      return stream;
    } catch (error) {
      console.error('Camera access failed:', error);
      throw new Error('Camera access denied');
    }
  }

  // Stop camera stream
  stopCamera(stream) {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  }

  // Clean expired sessions
  cleanExpiredSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.authSessions.entries()) {
      if (now > session.expires) {
        this.authSessions.delete(sessionId);
      }
    }
  }

  // Get active auth sessions count
  getActiveSessionsCount() {
    this.cleanExpiredSessions();
    return this.authSessions.size;
  }
}

export const qrCodeService = new QRCodeService();
export { QRCodeService };