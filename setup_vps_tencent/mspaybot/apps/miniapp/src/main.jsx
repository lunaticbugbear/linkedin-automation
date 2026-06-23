import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'Terjadi error saat memuat Mini App.',
    };
  }

  componentDidCatch(error, info) {
    console.error('[MiniAppErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="mini-shell">
        <div className="error-box">
          Mini App gagal dimuat. Coba tutup lalu buka ulang dari tombol Open Store.
          <br />
          Detail: {this.state.message}
        </div>
      </main>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
