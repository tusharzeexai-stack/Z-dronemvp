import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

function App() {
  // Main entry point for Z-DRONE frontend application
  const [page, setPage] = useState('login');

  useEffect(() => {
    const user = localStorage.getItem('z_drone_user');
    if (user) {
      setPage('dashboard');
    }
  }, []);

  const handleLogin = () => {
    setPage('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('z_drone_user');
    setPage('login');
  };

  return (
    <div className="min-h-screen bg-background text-on-background">
      {page === 'login' ? (
        <Login onLogin={handleLogin} />
      ) : (
        <Dashboard onLogout={handleLogout} />
      )}
    </div>
  );
}

export default App;
