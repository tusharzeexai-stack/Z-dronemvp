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
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);
    const particles = Array.from({ length: 55 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.4,
      dx: (Math.random() - 0.5) * 0.35,
      dy: (Math.random() - 0.5) * 0.35,
      op: Math.random() * 0.45 + 0.1,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.dx; p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(56,189,248,${p.op})`;
        ctx.fill();
      });
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 110) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(56,189,248,${0.1 * (1 - d / 110)})`;
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
    setLoading(true); setError('');
    localStorage.setItem('z_drone_user', JSON.stringify({
      email: username, name: 'Admin', role: 'Fleet Manager',
      loggedInAt: new Date().toISOString()
    }));
    setTimeout(() => { setLoading(false); setSuccess(true); setTimeout(() => onLogin(), 800); }, 1400);
  };

  return (
    <div style={{
      display: 'flex', minHeight: '100vh', overflow: 'hidden',
      background: 'linear-gradient(135deg,#020c1b 0%,#0a1628 50%,#071120 100%)',
      fontFamily: "'Inter', sans-serif"
    }}>

      {/* ═══ LEFT BRANDING PANEL ═══ */}
      <div style={{
        display: 'none', position: 'relative', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        width: '55%', minWidth: '55%', padding: '60px 48px', overflow: 'hidden'
      }} className="left-panel">
        {/* particle canvas */}
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
        {/* glows */}
        <div style={{ position: 'absolute', top: '20%', left: '20%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle,rgba(14,165,233,0.12) 0%,transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '20%', right: '15%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle,rgba(99,102,241,0.09) 0%,transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', maxWidth: 520 }}>
          {/* Drone HUD ring */}
          <div style={{ marginBottom: 36, position: 'relative' }}>
            <div style={{
              width: 160, height: 160, borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', position: 'relative',
              background: 'linear-gradient(135deg,rgba(14,165,233,0.15),rgba(14,165,233,0.04))',
              border: '1px solid rgba(14,165,233,0.3)',
              boxShadow: '0 0 60px rgba(14,165,233,0.14),inset 0 0 40px rgba(14,165,233,0.05)'
            }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px dashed rgba(14,165,233,0.28)', animation: 'spin 20s linear infinite' }} />
              <div style={{ position: 'absolute', inset: 16, borderRadius: '50%', border: '1px dashed rgba(14,165,233,0.14)', animation: 'spin 14s linear infinite reverse' }} />
              <img src="/drone1.jpg" alt="Drone" style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', filter: 'drop-shadow(0 0 18px rgba(14,165,233,0.55))' }} />
            </div>
            {/* pulse dot */}
            <div style={{ position: 'absolute', top: 8, right: 8, width: 16, height: 16, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 12px rgba(52,211,153,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#a7f3d0', animation: 'ping 1.5s ease infinite' }} />
            </div>
          </div>

          {/* subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ height: 1, width: 48, background: 'linear-gradient(to right,transparent,rgba(14,165,233,0.5))' }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(56,189,248,0.7)' }}>Powered by AI</span>
            <div style={{ height: 1, width: 48, background: 'linear-gradient(to left,transparent,rgba(14,165,233,0.5))' }} />
          </div>

          {/* headline */}
          <h1 style={{ fontSize: 48, fontWeight: 900, lineHeight: 1.15, letterSpacing: '-1px', marginBottom: 16, background: 'linear-gradient(135deg,#fff 0%,#93c5fd 55%,#38bdf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Z-DRONE<br />Platform
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: 'rgba(148,163,184,0.82)', marginBottom: 36, maxWidth: 420 }}>
            Enterprise-grade drone fleet management with AI-powered surveillance, real-time telemetry, and predictive maintenance.
          </p>

          {/* feature chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 40 }}>
            {[['smart_toy', 'AI Inference'], ['my_location', 'Live Tracking'], ['shield', 'Secure Fleet'], ['analytics', 'Analytics']].map(([icon, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)', color: 'rgba(186,230,253,0.9)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#38bdf8' }}>{icon}</span>
                {label}
              </div>
            ))}
          </div>

          {/* stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24, width: '100%' }}>
            {[['240+', 'Active Drones'], ['99.9%', 'Uptime SLA'], ['< 50ms', 'Latency']].map(([v, s]) => (
              <div key={s} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#38bdf8' }}>{v}</div>
                <div style={{ fontSize: 11, marginTop: 2, color: 'rgba(148,163,184,0.6)' }}>{s}</div>
              </div>
            ))}
          </div>
        </div>

        <p style={{ position: 'absolute', bottom: 24, fontSize: 11, color: 'rgba(100,116,139,0.5)' }}>© 2025 Z-DRONE Technologies · Enterprise Edition</p>
      </div>

      {/* ═══ RIGHT FORM PANEL ═══ */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '48px 32px', overflowY: 'auto',
        background: 'rgba(255,255,255,0.025)',
        borderLeft: '1px solid rgba(255,255,255,0.06)'
      }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          {/* Brand mark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#0ea5e9,#0369a1)', boxShadow: '0 4px 20px rgba(14,165,233,0.4)', flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 18 }}>flight_takeoff</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#38bdf8' }}>Z-DRONE</span>
          </div>

          {/* heading */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 32, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.2 }}>Welcome back</h2>
            <p style={{ fontSize: 14, color: 'rgba(148,163,184,0.7)', marginTop: 6 }}>Sign in to your operations center</p>
          </div>

          {/* form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* error */}
            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 13, fontWeight: 500 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, flexShrink: 0 }}>error</span>
                {error}
              </div>
            )}

            {/* username */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(148,163,184,0.7)', marginBottom: 8 }}>Username</label>
              <div style={{ position: 'relative' }}>
                <span className="material-symbols-outlined" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'rgba(56,189,248,0.6)', pointerEvents: 'none' }}>person</span>
                <input
                  type="text"
                  value={username}
                  onChange={e => { setUsername(e.target.value); setError(''); }}
                  placeholder="admin"
                  required
                  autoFocus
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '14px 16px 14px 44px', borderRadius: 12, fontSize: 14, fontWeight: 500,
                    color: '#fff', background: 'rgba(255,255,255,0.055)',
                    border: error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)',
                    outline: 'none', transition: 'border 0.2s',
                  }}
                  onFocus={e => e.target.style.border = '1px solid rgba(14,165,233,0.7)'}
                  onBlur={e => e.target.style.border = error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)'}
                />
              </div>
            </div>

            {/* password */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(148,163,184,0.7)' }}>Password</label>
                <a href="#" style={{ fontSize: 12, fontWeight: 600, color: '#38bdf8', textDecoration: 'none' }}>Forgot password?</a>
              </div>
              <div style={{ position: 'relative' }}>
                <span className="material-symbols-outlined" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'rgba(56,189,248,0.6)', pointerEvents: 'none' }}>lock</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="••••••••••"
                  required
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '14px 48px 14px 44px', borderRadius: 12, fontSize: 14, fontWeight: 500,
                    color: '#fff', background: 'rgba(255,255,255,0.055)',
                    border: error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)',
                    outline: 'none', transition: 'border 0.2s',
                  }}
                  onFocus={e => e.target.style.border = '1px solid rgba(14,165,233,0.7)'}
                  onBlur={e => e.target.style.border = error ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)'}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'rgba(148,163,184,0.5)', display: 'flex' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{showPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>

            {/* remember */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked style={{ width: 16, height: 16, accentColor: '#0ea5e9', cursor: 'pointer', borderRadius: 4 }} />
              <span style={{ fontSize: 13, color: 'rgba(148,163,184,0.7)' }}>Keep me signed in for 30 days</span>
            </label>

            {/* submit */}
            <button
              type="submit"
              disabled={loading || success}
              style={{
                width: '100%', padding: '15px 24px', borderRadius: 12, border: 'none',
                fontSize: 14, fontWeight: 700, color: '#fff', cursor: loading || success ? 'default' : 'pointer',
                background: success ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#0ea5e9,#0369a1)',
                boxShadow: success ? '0 4px 28px rgba(16,185,129,0.38)' : '0 4px 28px rgba(14,165,233,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s', opacity: loading ? 0.85 : 1,
                transform: 'translateY(0)',
              }}
              onMouseEnter={e => { if (!loading && !success) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {loading ? (
                <>
                  <svg style={{ animation: 'spin 0.8s linear infinite', width: 18, height: 18 }} viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Authenticating...
                </>
              ) : success ? (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>verified</span>
                  Access Granted
                </>
              ) : (
                <>
                  Sign In to Dashboard
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
                </>
              )}
            </button>
          </form>

          {/* credential hint */}
          <div style={{ marginTop: 24, padding: '12px 16px', borderRadius: 12, background: 'rgba(14,165,233,0.07)', border: '1px solid rgba(14,165,233,0.18)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#38bdf8', flexShrink: 0, marginTop: 1 }}>info</span>
            <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.7)', margin: 0, lineHeight: 1.55 }}>
              Default credentials:&nbsp;
              <strong style={{ color: '#7dd3fc' }}>admin</strong> / <strong style={{ color: '#7dd3fc' }}>Zeex@admin</strong>
            </p>
          </div>

          {/* footer */}
          <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center', gap: 24 }}>
            {['Privacy Policy', 'Terms', 'Support'].map(l => (
              <a key={l} href="#" style={{ fontSize: 12, color: 'rgba(100,116,139,0.55)', textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={e => e.target.style.color = '#38bdf8'}
                onMouseLeave={e => e.target.style.color = 'rgba(100,116,139,0.55)'}>{l}</a>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ responsive styles ═══ */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes ping { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.6); opacity: 0.4; } }
        @media (min-width: 1024px) {
          .left-panel { display: flex !important; }
        }
        input::placeholder { color: rgba(100,116,139,0.5); }
        input:-webkit-autofill,
        input:-webkit-autofill:focus {
          -webkit-text-fill-color: #fff !important;
          -webkit-box-shadow: 0 0 0 1000px rgba(10,22,40,0.95) inset !important;
        }
      `}</style>
    </div>
  );
}

export default Login;




