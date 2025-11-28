import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  componentDidCatch(error, info) {
    this.setState({ hasError: true, error, info });
    try {
      console.error('[ErrorBoundary] Caught error:', error, info);
      if (window && window.electronAPI && typeof window.electronAPI.rendererLog === 'function') {
        window.electronAPI.rendererLog(`[ErrorBoundary] ${error && error.stack ? error.stack : String(error)} ${info && info.componentStack ? info.componentStack : ''}`);
      }
    } catch (e) {
      console.error('Failed to send rendererLog from ErrorBoundary', e);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, background: '#fee', color: '#600' }}>
          <h3>Something went wrong</h3>
          <p>An unexpected error occurred. The error has been logged.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
