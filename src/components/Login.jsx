import React, { useState, useEffect } from 'react';

function Login({ onLogin }) {
  const [email, setEmail] = useState('admin');
  const [password, setPassword] = useState('Zeex@admin');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleSuccess, setGoogleSuccess] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Floating drone parallax effect
  useEffect(() => {
    const handleMouseMove = (e) => {
      const x = (e.clientX - window.innerWidth / 2) * 0.01;
      const y = (e.clientY - window.innerHeight / 2) * 0.01;
      setMousePos({ x, y });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email !== 'admin' || password !== 'Zeex@admin') {
      setError('Invalid username or password.');
      return;
    }
    setLoading(true);
    setError('');

    // Save session simulation
    localStorage.setItem('z_drone_user', JSON.stringify({
      email,
      name: email.includes('@') ? email.split('@')[0].replace('.', ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Admin',
      role: 'Fleet Manager',
      loggedInAt: new Date().toISOString()
    }));

    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setTimeout(() => {
        onLogin();
      }, 800);
    }, 1200);
  };

  const handleGoogleLogin = (e) => {
    e.preventDefault();
    setGoogleLoading(true);

    localStorage.setItem('z_drone_user', JSON.stringify({
      email: 'alex.rivera@gmail.com',
      name: 'Alex Rivera',
      role: 'Fleet Manager',
      loggedInAt: new Date().toISOString()
    }));

    setTimeout(() => {
      setGoogleLoading(false);
      setGoogleSuccess(true);
      setTimeout(() => {
        onLogin();
      }, 800);
    }, 1200);
  };

  return (
    <div className="min-h-screen flex bg-white text-slate-800 overflow-hidden">
      {/* Left Section: Branding & Imagery */}
      <section className="hidden lg:flex lg:w-3/5 bg-gradient-to-br from-sky-400 to-sky-600 relative overflow-hidden items-center justify-center p-3xl">
        {/* Atmospheric Pattern Overlay */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
        <div className="relative z-10 flex flex-col items-center text-center">
          <div 
            className="mb-xl transition-transform duration-200 ease-out"
            style={{ 
              transform: `translate(${mousePos.x}px, ${mousePos.y}px)`,
              animation: 'float 6s ease-in-out infinite'
            }}
          >
            <img 
              alt="Advanced surveillance drone hovering" 
              className="max-w-2xl drop-shadow-2xl" 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBKUnbuL1mGP15HYzszEK7WDn2uYUI2b9eTg-vW4JFUr_JHzsHpN6P6h7CsTZz8hTmutjPwI3jWmNpQhitX4EAZQFdFkdzlokmGOEwjq8V9-qDOHrlkJhnBxUbEnC_Oiq5rEJty4fZ4T11UogLN77DEYSVMOQwV2SGSnRMJjRoMZ8HE0x4EEHtAPyY7waqN0XLmyNqcWGNvwoFRYZ1TQUfXg2xkHFWaCKJ9Aa4sInwE1nWTQ_2ixo0XotGIoF-wkiSuh3_ZEWcSQ6A"
            />
          </div>
          <h1 className="font-display-lg text-display-lg text-white max-w-xl font-bold">
            Intelligent Drone Monitoring & Fleet Management
          </h1>
          <p className="font-body-lg text-body-lg text-white/95 mt-md max-w-lg">
            Real-time telemetry, automated logistics, and predictive maintenance for global drone operations.
          </p>
        </div>
        {/* Abstract Decoration */}
        <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute -top-16 -right-16 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
      </section>
      
      {/* Right Section: Login Form */}
      <section className="w-full lg:w-2/5 flex flex-col items-center justify-center p-lg bg-sky-50/10">
        {/* Mobile Brand Indicator */}
        <div className="lg:hidden mb-xl flex items-center gap-sm">
          <div className="w-10 h-10 bg-sky-500 rounded-xl flex items-center justify-center">
            <span className="material-symbols-outlined text-white">flight_takeoff</span>
          </div>
          <span className="font-headline-md text-headline-md font-bold tracking-tight text-sky-600">Z-DRONE</span>
        </div>
        
        <div className="bg-white border border-sky-100 shadow-xl shadow-sky-900/5 w-full max-w-md p-xl rounded-2xl flex flex-col gap-lg transition-all duration-300">
          <header className="flex flex-col items-center text-center gap-sm">
            <div className="hidden lg:flex w-14 h-14 bg-sky-50 rounded-2xl items-center justify-center mb-base border border-sky-100">
              <span className="material-symbols-outlined text-sky-500 text-[32px]">flight_takeoff</span>
            </div>
            <div className="hidden lg:block font-headline-md text-headline-md font-extrabold tracking-tighter text-sky-600">Z-DRONE</div>
            <h2 className="font-headline-md text-headline-md text-slate-800 mt-base font-bold">Welcome Back</h2>
            <p className="font-body-sm text-body-sm text-slate-500">Access your fleet operations center</p>
          </header>
          
          <form className="flex flex-col gap-md" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/40 text-xs py-2 px-3 rounded-lg text-center font-semibold animate-pulse">
                {error}
              </div>
            )}
            {/* Email Input */}
            <div className="flex flex-col gap-xs">
              <label className="font-label-md text-label-md text-slate-600 font-semibold" htmlFor="email">Username or Email</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline text-sm">mail</span>
                <input 
                  className="w-full pl-xl pr-md py-md rounded-xl border border-outline-variant bg-surface-container-lowest focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-body-md text-body-md" 
                  id="email" 
                  placeholder="admin" 
                  required 
                  type="text" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            {/* Password Input */}
            <div className="flex flex-col gap-xs">
              <div className="flex justify-between items-center">
                <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="password">Security Key</label>
                <a className="font-label-sm text-label-sm text-primary hover:underline" href="#">Forgot Password?</a>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline text-sm">lock</span>
                <input 
                  className="w-full pl-xl pr-md py-md rounded-xl border border-outline-variant bg-surface-container-lowest focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-body-md text-body-md" 
                  id="password" 
                  placeholder="••••••••" 
                  required 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            {/* Remember Me */}
            <label className="flex items-center gap-sm cursor-pointer w-fit group">
              <input className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary/20 transition-all" type="checkbox" defaultChecked />
              <span className="font-label-sm text-label-sm text-on-surface-variant group-hover:text-on-surface transition-colors">Keep me signed in for 30 days</span>
            </label>
            
            {/* Primary Action */}
            <button 
              className={`mt-base w-full font-label-md text-label-md py-md rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-sm shadow-sm text-white ${
                success 
                  ? 'bg-emerald-500 hover:bg-emerald-600' 
                  : 'bg-primary hover:bg-primary/95'
              }`} 
              type="submit"
              disabled={loading || success}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Authenticating...</span>
                </>
              ) : success ? (
                <>
                  <span className="material-symbols-outlined">check_circle</span>
                  <span>Success</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </>
              )}
            </button>
          </form>
          
          <div className="relative flex items-center py-md">
            <div className="flex-grow border-t border-outline-variant/30"></div>
            <span className="flex-shrink mx-md font-label-sm text-label-sm text-outline">or continue with</span>
            <div className="flex-grow border-t border-outline-variant/30"></div>
          </div>
          
          {/* Secondary Actions */}
          <button 
            onClick={handleGoogleLogin} 
            disabled={googleLoading || googleSuccess}
            className={`w-full flex items-center justify-center gap-sm py-md px-lg rounded-xl border transition-colors active:scale-[0.98] ${
              googleSuccess 
                ? 'border-emerald-500 bg-emerald-50 text-emerald-600' 
                : 'border-outline-variant/50 bg-white hover:bg-surface-container-low text-on-surface'
            }`}
          >
            {googleLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-slate-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="ml-2 font-label-md text-label-md">Connecting to Google...</span>
              </>
            ) : googleSuccess ? (
              <>
                <span className="material-symbols-outlined text-emerald-600">check_circle</span>
                <span className="font-label-md text-label-md">Google Verified</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"></path>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path>
                </svg>
                <span className="font-label-md text-label-md">Login with Google</span>
              </>
            )}
          </button>
          
          {/* Support/Register Footer */}
          <footer className="mt-lg pt-lg border-t border-outline-variant/20 flex flex-wrap justify-center gap-xl">
            <a className="font-label-sm text-label-sm text-secondary hover:text-primary transition-colors" href="#">Privacy Policy</a>
            <a className="font-label-sm text-label-sm text-secondary hover:text-primary transition-colors" href="#">Terms & Conditions</a>
            <a className="font-label-sm text-label-sm text-secondary hover:text-primary transition-colors" href="#">Support Center</a>
          </footer>
        </div>
        
        {/* Language/Theme Selector Floating */}
        <div className="fixed bottom-lg right-lg flex gap-md">
          <button className="p-sm bg-white border border-outline-variant/30 rounded-lg shadow-sm hover:bg-surface-container-low transition-all">
            <span className="material-symbols-outlined text-outline">language</span>
          </button>
          <button className="p-sm bg-white border border-outline-variant/30 rounded-lg shadow-sm hover:bg-surface-container-low transition-all">
            <span className="material-symbols-outlined text-outline">help</span>
          </button>
        </div>
      </section>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(1deg); }
        }
      `}</style>
    </div>
  );
}

export default Login;
