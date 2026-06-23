import React from 'react';
import Dashboard from './components/Dashboard';

function App() {
  return (
    <div className="min-h-screen bg-background text-on-background">
      <Dashboard onLogout={() => {}} />
    </div>
  );
}

export default App;
