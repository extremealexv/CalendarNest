import React, { useState, useEffect, useRef } from 'react';
import { qrCodeService } from '../services/QRCodeService';
import { authService } from '../services/AuthService';
import './AuthScreen.css';

const AuthScreen = ({ onAuthenticate }) => {
  const [authMode, setAuthMode] = useState('welcome'); // welcome, manual, qr, scanning
  const [qrCode, setQrCode] = useState(null);
  const [authUrl, setAuthUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cameraStream, setCameraStream] = useState(null);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scanIntervalRef = useRef(null);

  useEffect(() => {
    // Clean up camera on unmount
    return () => {
      if (cameraStream) {
        qrCodeService.stopCamera(cameraStream);
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, [cameraStream]);

  const handleManualAuth = async () => {
    try {
      setLoading(true);
      setError('');
      
      const code = await authService.startAuthentication();
      const account = await authService.completeAuthentication(code);
      
      onAuthenticate(account);
    } catch (error) {
      console.error('Manual authentication failed:', error);
      setError(error.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const generateQRAuth = async () => {
    try {
      setLoading(true);
      setError('');
      setAuthMode('qr');
      
      const qrData = await qrCodeService.generateAuthQR();
      setQrCode(qrData.qrCode);
      setAuthUrl(qrData.authUrl);
      
      // Poll for QR scan completion
      const pollInterval = setInterval(async () => {
        const status = qrCodeService.getAuthSessionStatus(qrData.sessionId);
        
        if (status.status === 'completed' && status.accountData) {
          clearInterval(pollInterval);
          onAuthenticate(status.accountData);
        } else if (status.status === 'expired' || status.status === 'not_found') {
          clearInterval(pollInterval);
          setError('QR code expired. Please generate a new one.');
          setAuthMode('welcome');
        }
      }, 2000);
      
    } catch (error) {
      console.error('QR generation failed:', error);
      setError(error.message || 'Failed to generate QR code');
      setAuthMode('welcome');
    } finally {
      setLoading(false);
    }
  };

  const startQRScanning = async () => {
    try {
      setLoading(true);
      setError('');
      setAuthMode('scanning');
      
      const stream = await qrCodeService.startCamera(videoRef.current);
      setCameraStream(stream);
      
      // Start scanning loop
      scanIntervalRef.current = setInterval(() => {
        scanForQR();
      }, 500);
      
    } catch (error) {
      console.error('Camera start failed:', error);
      setError('Camera access denied. Please check permissions.');
      setAuthMode('welcome');
    } finally {
      setLoading(false);
    }
  };

  const scanForQR = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      qrCodeService.scanQRCode(imageData, canvas)
        .then(result => {
          if (result && result.success) {
            if (result.type === 'auth') {
              // Handle auth QR result
              handleQRAuthResult(result);
            } else if (result.type === 'switch') {
              // Handle account switch
              handleAccountSwitch(result.accountId);
            }
          }
        })
        .catch(error => {
          console.warn('QR scan error:', error);
        });
    }
  };

  const handleQRAuthResult = async (result) => {
    try {
      stopScanning();
      setLoading(true);
      
      // Open auth URL and complete authentication
      window.open(result.authUrl, '_blank');
      // In a real implementation, this would wait for the auth completion
      // For now, we'll show a message to complete auth in the opened window
      
    } catch (error) {
      console.error('QR auth handling failed:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAccountSwitch = async (accountId) => {
    try {
      // Switch to existing account (implementation depends on how accounts are stored)
      console.log('Switching to account:', accountId);
    } catch (error) {
      console.error('Account switch failed:', error);
    }
  };

  const stopScanning = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    
    if (cameraStream) {
      qrCodeService.stopCamera(cameraStream);
      setCameraStream(null);
    }
  };

  const resetToWelcome = () => {
    stopScanning();
    setAuthMode('welcome');
    setError('');
    setQrCode(null);
    setAuthUrl('');
  };

  const renderWelcomeScreen = () => {
    console.log('Rendering welcome screen');
    return (
    <div className="auth-welcome" style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '40px', borderRadius: '10px' }}>
      <div className="welcome-header">
        <h1 style={{ color: 'white', fontSize: '3rem', textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>Welcome to FamSync</h1>
        <p style={{ color: 'white', fontSize: '1.5rem', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>Your family calendar kiosk</p>
      </div>
      
      <div className="auth-options">
        <button 
          className="btn btn-large btn-primary" 
          onClick={handleManualAuth}
          disabled={loading}
          style={{ 
            backgroundColor: '#4CAF50', 
            color: 'white', 
            fontSize: '1.3rem', 
            padding: '20px 40px',
            border: '2px solid white',
            boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
          }}
        >
          <span className="btn-icon">🔐</span>
          Sign in with Google
        </button>
        
        <button 
          className="btn btn-large btn-secondary" 
          onClick={generateQRAuth}
          disabled={loading}
          style={{ 
            backgroundColor: '#2196F3', 
            color: 'white', 
            fontSize: '1.3rem', 
            padding: '20px 40px',
            border: '2px solid white',
            boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
          }}
        >
          <span className="btn-icon">📱</span>
          Generate QR Code
        </button>
        
        <button 
          className="btn btn-large btn-secondary" 
          onClick={startQRScanning}
          disabled={loading}
          style={{ 
            backgroundColor: '#FF9800', 
            color: 'white', 
            fontSize: '1.3rem', 
            padding: '20px 40px',
            border: '2px solid white',
            boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
          }}
        >
          <span className="btn-icon">📷</span>
          Scan QR Code
        </button>
      </div>
      
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button className="btn btn-small" onClick={() => setError('')}>
            Dismiss
          </button>
        </div>
      )}
    </div>
    );
  };

  const renderQRScreen = () => (
    <div className="auth-qr">
      <div className="qr-header">
        <h2>Scan with your phone</h2>
        <p>Open your camera app and scan this QR code</p>
      </div>
      
      {qrCode && (
        <div className="qr-container">
          <img src={qrCode} alt="Authentication QR Code" className="qr-image" />
        </div>
      )}
      
      <div className="qr-instructions">
        <ol>
          <li>Open your phone's camera app</li>
          <li>Point it at the QR code above</li>
          <li>Tap the notification to open the link</li>
          <li>Sign in with your Google account</li>
        </ol>
      </div>
      
      <div className="qr-actions">
        <button className="btn btn-secondary" onClick={generateQRAuth}>
          Generate New Code
        </button>
        <button className="btn" onClick={resetToWelcome}>
          Back
        </button>
      </div>
    </div>
  );

  const renderScanningScreen = () => (
    <div className="auth-scanning">
      <div className="scanning-header">
        <h2>Scanning for QR Code</h2>
        <p>Hold a QR code in front of the camera</p>
      </div>
      
      <div className="camera-container">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          className="camera-feed"
        />
        <canvas 
          ref={canvasRef} 
          style={{ display: 'none' }}
        />
        <div className="scanning-overlay">
          <div className="scan-frame"></div>
        </div>
      </div>
      
      <div className="scanning-actions">
        <button className="btn" onClick={resetToWelcome}>
          Cancel Scanning
        </button>
      </div>
    </div>
  );

  return (
    <div className="auth-screen">
      {authMode === 'welcome' && renderWelcomeScreen()}
      {authMode === 'qr' && renderQRScreen()}
      {authMode === 'scanning' && renderScanningScreen()}
      
      {loading && (
        <div className="auth-loading">
          <div className="spinner"></div>
          <p>Processing...</p>
        </div>
      )}
    </div>
  );
};

export default AuthScreen;