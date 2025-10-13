import React from 'react';
import './LoadingScreen.css';

const LoadingScreen = ({ message = 'Loading FamSync...' }) => {
  console.log('LoadingScreen rendered with message:', message);
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
        <h2 className="loading-title" style={{ fontSize: '2rem', marginBottom: '1rem' }}>FamSync</h2>
        <p className="loading-message" style={{ fontSize: '1.2rem' }}>{message}</p>
      </div>
    </div>
  );
};

export default LoadingScreen;