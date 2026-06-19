import React, { useState, useEffect, useRef } from 'react';

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const canvasRef = useRef(null);

  /* ── Animated particle canvas ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.5,
      dx: (Math.random() - 0.5) * 0.4,
      dy: (Math.random() - 0.5) * 0.4,
      opacity: Math.random() * 0.5 + 0.1,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.dx; p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(56,189,248,${p.opacity})`;
        ctx.fill();
      });
      // Connect nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(56,189,248,${0.12 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username !== 'admin' || password !== 'Zeex@admin') {
      setError('Invalid credentials. Please try again.');
      return;
    }
    setLoading(true);
    setError('');
    localStorage.setItem('z_drone_user', JSON.stringify({
      email: username,
      name: 'Admin',
      role: 'Fleet Manager',
      loggedInAt: new Date().toISOString()
    }));
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setTimeout(() => onLogin(), 800);
    }, 1400);
  };

  return (
    <div className="min-h-screen flex overflow-hidden" style={{ background: 'linear-gradient(135deg, #020c1b 0%, #0a1628 40%, #071120 100%)' }}>

      {/* ── Left: Animated brand panel ── */}
      <div className="hidden lg:flex lg:w-[58%] relative flex-col items-center justify-center p-16 overflow-hidden">
        {/* Particle canvas */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} />

        {/* Radial glow orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full" style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.12) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)', filter: 'blur(40px)' }} />

        {/* Main content */}
        <div className="relative z-10 flex flex-col items-center text-center max-w-xl">
          {/* Drone icon HUD */}
          <div className="mb-10 relative">
            <div className="w-40 h-40 rounded-full flex items-center justify-center relative"
              style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.15), rgba(14,165,233,0.05))', border: '1px solid rgba(14,165,233,0.3)', boxShadow: '0 0 60px rgba(14,165,233,0.15), inset 0 0 40px rgba(14,165,233,0.05)' }}>
              {/* Rotating ring */}
              <div className="absolute inset-0 rounded-full" style={{ border: '1px dashed rgba(14,165,233,0.3)', animation: 'spin 20s linear infinite' }} />
              <div className="absolute inset-4 rounded-full" style={{ border: '1px dashed rgba(14,165,233,0.15)', animation: 'spin 15s linear infinite reverse' }} />
              {/* Drone image */}
              <img src="/drone1.jpg" alt="Z-DRONE" className="w-24 h-24 object-cover rounded-full" style={{ filter: 'drop-shadow(0 0 20px rgba(14,165,233,0.6))' }} />
            </div>
            {/* Pulsing dot */}
            <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-emerald-400 flex items-center justify-center" style={{ boxShadow: '0 0 12px rgba(52,211,153,0.8)' }}>
              <div className="w-2 h-2 rounded-full bg-emerald-300 animate-ping" />
            </div>
          </div>

          {/* Brand name */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px flex-1 w-12" style={{ background: 'linear-gradient(to right, transparent, rgba(14,165,233,0.5))' }} />
            <span className="text-xs font-bold tracking-[0.3em] uppercase" style={{ color: 'rgba(56,189,248,0.7)' }}>Powered by AI</span>
            <div className="h-px flex-1 w-12" style={{ background: 'linear-gradient(to left, transparent, rgba(14,165,233,0.5))' }} />
          </div>

          <h1 className="text-5xl font-black tracking-tight mb-4 leading-tight" style={{ background: 'linear-gradient(135deg, #fff 0%, #93c5fd 60%, #38bdf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Z-DRONE<br />Platform
          </h1>
          <p className="text-base leading-relaxed mb-10" style={{ color: 'rgba(148,163,184,0.85)' }}>
            Enterprise-grade drone fleet management with AI-powered surveillance, real-time telemetry, and predictive maintenance.
          </p>

          {/* Feature chips */}
          <div className="flex flex-wrap gap-3 justify-center">
            {[
              { icon: 'smart_toy', label: 'AI Inference' },
              { icon: 'my_location', label: 'Live Tracking' },
              { icon: 'shield', label: 'Secure Fleet' },
              { icon: 'analytics', label: 'Analytics' },
            ].map(f => (
              <div key={f.label} className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)', color: 'rgba(186,230,253,0.9)' }}>
                <span className="material-symbols-outlined text-sm" style={{ color: '#38bdf8' }}>{f.icon}</span>
                {f.label}
              </div>
            ))}
          </div>

          {/* Stats row */}
          <div className="mt-10 grid grid-cols-3 gap-6 w-full">
            {[
              { val: '240+', sub: 'Active Drones' },
              { val: '99.9%', sub: 'Uptime SLA' },
              { val: '< 50ms', sub: 'Latency' },
            ].map(s => (
              <div key={s.sub} className="text-center">
                <div className="text-2xl font-black" style={{ color: '#38bdf8' }}>{s.val}</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'rgba(148,163,184,0.6)' }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <div className="absolute bottom-8 left-0 right-0 text-center">
          <p className="text-xs" style={{ color: 'rgba(100,116,139,0.6)' }}>
            © 2025 Z-DRONE Technologies · Enterprise Edition
          </p>
        </div>
      </div>

      {/* ── Right: Login form panel ── */}
      <div className="w-full lg:w-[42%] flex flex-col items-center justify-center px-6 py-12 relative"
        style={{ background: 'rgba(255,255,255,0.03)', borderLeft: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}>

        {/* Mobile brand */}
        <div className="lg:hidden flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0ea5e9, #0369a1)' }}>
            <span className="material-symbols-outlined text-white text-xl">flight_takeoff</span>
          </div>
          <span className="text-xl font-black text-white tracking-tight">Z-DRONE</span>
        </div>

        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0ea5e9, #0369a1)', boxShadow: '0 4px 20px rgba(14,165,233,0.4)' }}>
                <span className="material-symbols-outlined text-white text-base">flight_takeoff</span>
              </div>
              <span className="text-sm font-bold tracking-widest uppercase" style={{ color: '#38bdf8' }}>Z-DRONE</span>
            </div>
            <h2 className="text-3xl font-black text-white mb-2">Welcome back</h2>
            <p className="text-sm" style={{ color: 'rgba(148,163,184,0.7)' }}>Sign in to your operations center</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Error alert */}
            {error && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                <span className="material-symbols-outlined text-base">error</span>
                {error}
              </div>
            )}

            {/* Username */}
            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(148,163,184,0.7)' }}>
                Username
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-lg" style={{ color: 'rgba(56,189,248,0.6)' }}>person</span>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={e => { setUsername(e.target.value); setError(''); }}
                  placeholder="admin"
                  required
                  autoFocus
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl text-sm font-medium text-white placeholder-slate-600 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
                  }}
                  onFocus={e => e.target.style.border = '1px solid rgba(14,165,233,0.6)'}
                  onBlur={e => e.target.style.border = error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)'}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(148,163,184,0.7)' }}>
                  Password
                </label>
                <a href="#" className="text-xs font-semibold transition-colors" style={{ color: '#38bdf8' }}
                  onMouseEnter={e => e.target.style.color = '#7dd3fc'}
                  onMouseLeave={e => e.target.style.color = '#38bdf8'}>
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-lg" style={{ color: 'rgba(56,189,248,0.6)' }}>lock</span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="••••••••••"
                  required
                  className="w-full pl-11 pr-12 py-3.5 rounded-xl text-sm font-medium text-white placeholder-slate-600 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
                  }}
                  onFocus={e => e.target.style.border = '1px solid rgba(14,165,233,0.6)'}
                  onBlur={e => e.target.style.border = error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)'}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  style={{ color: 'rgba(148,163,184,0.5)' }}>
                  <span className="material-symbols-outlined text-lg">{showPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>

            {/* Remember me */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative w-5 h-5 flex-shrink-0">
                <input type="checkbox" defaultChecked className="peer sr-only" />
                <div className="w-5 h-5 rounded-md border transition-all peer-checked:border-sky-500"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)' }} />
                <div className="absolute inset-0 rounded-md hidden peer-checked:flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #0ea5e9, #0369a1)' }}>
                  <span className="material-symbols-outlined text-white text-sm">check</span>
                </div>
              </div>
              <span className="text-xs" style={{ color: 'rgba(148,163,184,0.7)' }}>Keep me signed in for 30 days</span>
            </label>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading || success}
              className="w-full py-4 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2.5 transition-all relative overflow-hidden"
              style={{
                background: success
                  ? 'linear-gradient(135deg, #10b981, #059669)'
                  : 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
                boxShadow: success
                  ? '0 4px 30px rgba(16,185,129,0.4)'
                  : '0 4px 30px rgba(14,165,233,0.35)',
                transform: 'translateY(0)',
                opacity: loading ? 0.85 : 1,
              }}
              onMouseEnter={e => { if (!loading && !success) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Authenticating...</span>
                </>
              ) : success ? (
                <>
                  <span className="material-symbols-outlined text-xl">verified</span>
                  <span>Access Granted</span>
                </>
              ) : (
                <>
                  <span>Sign In to Dashboard</span>
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          {/* Hint */}
          <div className="mt-6 px-4 py-3 rounded-xl flex items-start gap-3" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.15)' }}>
            <span className="material-symbols-outlined text-base mt-0.5 flex-shrink-0" style={{ color: '#38bdf8' }}>info</span>
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.7)' }}>
              Use credentials: <span className="font-bold" style={{ color: '#7dd3fc' }}>admin</span> / <span className="font-bold" style={{ color: '#7dd3fc' }}>Zeex@admin</span>
            </p>
          </div>

          {/* Footer links */}
          <div className="mt-8 flex justify-center gap-6">
            {['Privacy Policy', 'Terms of Service', 'Support'].map(l => (
              <a key={l} href="#" className="text-xs transition-colors"
                style={{ color: 'rgba(100,116,139,0.6)' }}
                onMouseEnter={e => e.target.style.color = '#38bdf8'}
                onMouseLeave={e => e.target.style.color = 'rgba(100,116,139,0.6)'}>
                {l}
              </a>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus {
          -webkit-text-fill-color: #fff !important;
          -webkit-box-shadow: 0 0 0px 1000px rgba(255,255,255,0.05) inset !important;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>
    </div>
  );
}

export default Login;
