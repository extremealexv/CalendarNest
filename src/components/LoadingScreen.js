import React from 'react';
import './LoadingScreen.css';

const LoadingScreen = ({ message = 'Loading FamSync...' }) => {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
        <h2 className="loading-title">FamSync</h2>
        <p className="loading-message">{message}</p>
      </div>
    </div>
  );
};

export default LoadingScreen;