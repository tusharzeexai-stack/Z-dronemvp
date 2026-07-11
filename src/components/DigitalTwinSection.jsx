import React, { useEffect, useRef, useState } from 'react';

function DigitalTwinSection() {
  const horizonCanvasRef = useRef(null);
  const vibrationCanvasRef = useRef(null);
  const terminalEndRef = useRef(null);

  // States
  const [twinStatus, setTwinStatus] = useState('NOMINAL'); // NOMINAL, WARNING, CRITICAL
  const [isArmed, setIsArmed] = useState(false);
  const [isTethered, setIsTethered] = useState(false);
  const [flightState, setFlightState] = useState('Grounded'); // Grounded, Hovering, Returning, Landing
  const [pitch, setPitch] = useState(0);
  const [roll, setRoll] = useState(0);
  const [yaw, setYaw] = useState(182.4);
  const [throttle, setThrottle] = useState(0);
  const [ledMode, setLedMode] = useState('strobe'); // strobe, solid, stealth
  const [windSpeed, setWindSpeed] = useState(2.4); // m/s
  const [activeFaults, setActiveFaults] = useState([]);
  const [logs, setLogs] = useState([
    'System init. Loading digital twin mapping keys...',
    'Sensors handshake: IMU, Barometer, LiDAR, Magnetometer... OK',
    'Virtual state engine linked to simulated hardware port COM3.',
    'Status: Nominal. Waiting for arm command.'
  ]);

  // Telemetry variables
  const [motorTemp, setMotorTemp] = useState([32, 32, 33, 32]);
  const [motorRpm, setMotorRpm] = useState([0, 0, 0, 0]);
  const [escLoad, setEscLoad] = useState(0);
  const [batteryVoltage, setBatteryVoltage] = useState(16.76);
  const [currentDraw, setCurrentDraw] = useState(0.8);

  // Animation ticks
  const animationFrameRef = useRef(null);
  const logIntervalRef = useRef(null);

  // Draw Attitude Horizon Indicator on Canvas
  useEffect(() => {
    const canvas = horizonCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const drawHorizon = () => {
      const w = canvas.width;
      const h = canvas.height;
      const r = Math.min(w, h) / 2;

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      
      // Move to center
      ctx.translate(w / 2, h / 2);
      
      // Rotate for Roll angle
      ctx.rotate((-roll * Math.PI) / 180);

      // Pitch displacement (scale factor)
      const pitchOffset = (pitch / 90) * (r * 0.8);

      // Draw Sky (blue)
      ctx.fillStyle = '#0ea5e9';
      ctx.beginPath();
      ctx.arc(0, pitchOffset, r, Math.PI, 0);
      ctx.fill();

      // Draw Ground (brownish-slate)
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(0, pitchOffset, r, 0, Math.PI);
      ctx.fill();

      // Draw Horizon dividing line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-r, pitchOffset);
      ctx.lineTo(r, pitchOffset);
      ctx.stroke();

      // Pitch graduation lines
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1.5;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';

      for (let p = -30; p <= 30; p += 10) {
        if (p === 0) continue;
        const lineOffset = pitchOffset - (p / 90) * (r * 0.8);
        const lineLength = p % 20 === 0 ? 30 : 15;
        
        ctx.beginPath();
        ctx.moveTo(-lineLength, lineOffset);
        ctx.lineTo(lineLength, lineOffset);
        ctx.stroke();
        
        ctx.fillText(p.toString(), -lineLength - 10, lineOffset + 3);
        ctx.fillText(p.toString(), lineLength + 10, lineOffset + 3);
      }

      ctx.restore();

      // Fixed airplane symbol overlay (doesn't rotate/move)
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 3;
      ctx.beginPath();
      // Center dot
      ctx.arc(w / 2, h / 2, 3, 0, Math.PI * 2);
      ctx.stroke();
      // Left wing line
      ctx.moveTo(w / 2 - 40, h / 2);
      ctx.lineTo(w / 2 - 15, h / 2);
      ctx.lineTo(w / 2 - 15, h / 2 + 8);
      // Right wing line
      ctx.moveTo(w / 2 + 40, h / 2);
      ctx.lineTo(w / 2 + 15, h / 2);
      ctx.lineTo(w / 2 + 15, h / 2 + 8);
      ctx.stroke();

      // Outer housing ring and angle scale ticks
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r - 2, 0, Math.PI * 2);
      ctx.stroke();
    };

    drawHorizon();
  }, [pitch, roll]);

  // Draw Vibration Spectrum Analyzer
  useEffect(() => {
    const canvas = vibrationCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let frameId;
    const pointsCount = 40;
    const array = Array.from({ length: pointsCount }, () => Math.random() * 20);

    const drawVibration = () => {
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(14, 165, 233, 0.05)';
      ctx.fillRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 30) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += 20) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      // Draw active waveform
      ctx.strokeStyle = twinStatus === 'CRITICAL' ? '#ef4444' : twinStatus === 'WARNING' ? '#f59e0b' : '#0ea5e9';
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      const step = w / pointsCount;
      // Fluctuations based on armed state and throttle
      const multiplier = isArmed ? 5 + (throttle / 100) * 20 : 0.8;
      const noise = twinStatus === 'CRITICAL' ? 3.5 : 1.0;

      for (let i = 0; i < pointsCount; i++) {
        array[i] = array[i] * 0.8 + (Math.random() * multiplier * noise) * 0.2;
        const x = i * step;
        const y = h - 10 - array[i];
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      frameId = requestAnimationFrame(drawVibration);
    };

    drawVibration();
    return () => cancelAnimationFrame(frameId);
  }, [isArmed, throttle, twinStatus]);

  // Live Scrolling Terminal Log Simulator (adds NMEA/raw sensor feeds)
  useEffect(() => {
    logIntervalRef.current = setInterval(() => {
      const lat = 28.8300 + (Math.random() - 0.5) * 0.01;
      const lng = 76.9300 + (Math.random() - 0.5) * 0.01;
      const gpsTime = new Date().toISOString().split('T')[1].replace('Z', '').replace(/:/g, '').substring(0, 6) + '.00';

      // NMEA strings
      const nmeaGga = `$GNGGA,${gpsTime},${Math.abs(lat).toFixed(4)},N,${Math.abs(lng).toFixed(4)},E,1,08,1.2,45.2,M,0.0,M,,*5C`;
      const nmeaRmc = `$GNRMC,${gpsTime},A,${Math.abs(lat).toFixed(4)},N,${Math.abs(lng).toFixed(4)},E,${(throttle * 0.15).toFixed(1)},182.4,100726,,,A*7B`;

      const sensorLogs = [
        nmeaGga,
        nmeaRmc,
        `[IMU] Pitch: ${pitch.toFixed(1)} | Roll: ${roll.toFixed(1)} | Yaw: ${yaw.toFixed(1)} | AccelZ: ${(1.0 + (throttle / 1500) + (Math.random() - 0.5) * 0.05).toFixed(3)}G`,
        isTethered
          ? `[TETHER] HV Line: 16.80V | Draw: 14.2A | Tether Temp: 38°C | Tension: 1.4kg`
          : `[BMS] Voltage: ${batteryVoltage.toFixed(2)}V | Current: ${currentDraw.toFixed(1)}A | CellTemp: ${motorTemp[0]}°C`
      ];

      // Add a random sensor line to the log
      const randomLine = sensorLogs[Math.floor(Math.random() * sensorLogs.length)];
      setLogs(prev => {
        const next = [...prev, randomLine];
        if (next.length > 50) next.shift(); // Cap console history
        return next;
      });

      // Update mock gauges when armed
      if (isArmed) {
        // Motor temperature rises slowly with throttle
        setMotorTemp(prev => prev.map((t, idx) => {
          const targetTemp = 35 + (throttle * 0.3) + idx * (Math.random() * 2);
          return t < targetTemp ? Math.round(t + 0.5) : Math.round(t - 0.2);
        }));

        // Motor RPM
        const baseRpm = throttle * 85;
        setMotorRpm(prev => prev.map(() => Math.round(baseRpm + (Math.random() - 0.5) * 150)));

        // ESC Load
        setEscLoad(Math.round(throttle * 0.95));

        // Battery voltage drops with current draw (except when tethered)
        const draw = isTethered ? 14.2 : (2.0 + (throttle * 0.32) + (windSpeed * 0.5));
        setCurrentDraw(parseFloat(draw.toFixed(1)));
        if (isTethered) {
          setBatteryVoltage(16.80);
        } else {
          setBatteryVoltage(prev => Math.max(14.0, prev - (draw * 0.0005)));
        }
      } else {
        // Cool down
        setMotorTemp(prev => prev.map(t => Math.max(32, Math.round(t - 0.5))));
        setMotorRpm([0, 0, 0, 0]);
        setEscLoad(0);
        setCurrentDraw(0.8);
        setBatteryVoltage(prev => Math.min(16.76, prev + 0.02)); // charging
      }
    }, 1000);

    return () => clearInterval(logIntervalRef.current);
  }, [isArmed, isTethered, throttle, pitch, roll, yaw, windSpeed, batteryVoltage, currentDraw, motorTemp]);

  // Auto-scroll terminal console
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Autopilot Control Command Handlers
  const handleArmToggle = () => {
    const nextArmed = !isArmed;
    setIsArmed(nextArmed);
    if (nextArmed) {
      setFlightState('Hovering');
      setThrottle(45);
      setPitch(2.0);
      setRoll(-1.5);
      setLogs(prev => [...prev, '>>> CMD RECEIVED: ARM MOTOR CIRCUITS', 'Motors spooled up. Altitude: 1.2m, Flight controller stabilized.']);
    } else {
      setFlightState('Grounded');
      setThrottle(0);
      setPitch(0);
      setRoll(0);
      setIsTethered(false);
      setLogs(prev => [...prev, '>>> CMD RECEIVED: DISARM MOTORS', 'Motors halted. Virtual copy set to standby.']);
    }
  };

  const handleTakeoff = () => {
    if (!isArmed) {
      alert("Arm the motors first!");
      return;
    }
    setFlightState('Hovering');
    setThrottle(65);
    setPitch(4.0);
    setLogs(prev => [...prev, '>>> CMD RECEIVED: TAKEOFF AUTOPILOT', 'Ascending to waypoint height 15m. Cruise set.']);
  };

  const handleLand = () => {
    if (!isArmed) return;
    setFlightState('Landing');
    setThrottle(20);
    setPitch(0.5);
    setRoll(0.2);
    setLogs(prev => [...prev, '>>> CMD RECEIVED: LAND AT LOCATION', 'Triggering descent. Autoland scan initialized...']);
    
    // Auto disarm in 4s
    setTimeout(() => {
      setIsArmed(false);
      setFlightState('Grounded');
      setThrottle(0);
      setPitch(0);
      setRoll(0);
      setLogs(prev => [...prev, 'Descent complete. Ground touch verified. Disarmed.']);
    }, 4000);
  };

  const handleRTH = () => {
    if (!isArmed) return;
    setFlightState('Returning');
    setThrottle(75);
    setPitch(-3.5);
    setRoll(0);
    setLogs(prev => [...prev, '>>> CMD RECEIVED: RETURN TO HOME (RTH)', 'Switching controls to home coordinates. Returning to pad.']);
  };

  // Fault injection simulation trigger
  const handleInjectFault = (faultName) => {
    if (activeFaults.includes(faultName)) return;

    setActiveFaults(prev => [...prev, faultName]);
    setTwinStatus('CRITICAL');

    let logAlert = '';
    if (faultName === 'motor') {
      logAlert = '⚠️ CRITICAL FAULT: Motor 4 RPM drop detected! ESC current overload. switching to Tri-rotor emergency flight mode.';
      setRoll(-12.5); // roll compensation
    } else if (faultName === 'lidar') {
      logAlert = '⚠️ WARNING FAULT: LiDAR optical pathway obstructed! Rangefinder disconnected. Fallback to Barometric altitude hold.';
    } else if (faultName === 'gps') {
      logAlert = '⚠️ CRITICAL FAULT: GPS Jamming / signal loss (HDOP > 8). Dropping coordinate locking. Enabling visual tracking position hold.';
      setYaw(y => (y + 45) % 360);
    }

    setLogs(prev => [...prev, logAlert]);
  };

  const handleClearFaults = () => {
    setActiveFaults([]);
    setTwinStatus('NOMINAL');
    setRoll(-1.5);
    setPitch(2.0);
    setLogs(prev => [...prev, '✔ FAULTS CLEARED: Re-running sensor handshake checks...', 'All sensors checked. Autopilot status returned to NOMINAL.']);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 text-left">
      {/* LEFT COLUMN: 3D Attitude Horizon, ESC load dials */}
      <div className="xl:col-span-8 space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex justify-between items-center mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-850 dark:text-slate-100 uppercase tracking-wider">Attitude Horizon & Diagnostics</h3>
            <div className="flex gap-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                isArmed 
                  ? 'bg-red-500/10 border-red-500/30 text-red-500 animate-pulse' 
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
              }`}>
                {isArmed ? 'ARMED' : 'DISARMED'}
              </span>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded border bg-sky-500/10 border-sky-500/30 text-sky-500 uppercase">
                {flightState}
              </span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Horizon indicator */}
            <div className="flex flex-col items-center border border-slate-100 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-900/50">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3">3D Attitude Indicator (Virtual Copy)</span>
              <canvas ref={horizonCanvasRef} width={200} height={200} className="bg-slate-950 rounded-full border-4 border-slate-850 shadow-inner" />
              <div className="grid grid-cols-3 gap-4 text-center mt-4 w-full text-xs text-slate-500">
                <div>
                  <div className="text-[9px] uppercase">Pitch</div>
                  <div className="font-bold text-slate-800 dark:text-slate-100">{pitch.toFixed(1)}°</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase">Roll</div>
                  <div className="font-bold text-slate-800 dark:text-slate-100">{roll.toFixed(1)}°</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase">Yaw (Heading)</div>
                  <div className="font-bold text-slate-800 dark:text-slate-100">{yaw.toFixed(1)}°</div>
                </div>
              </div>
            </div>

            {/* Motor diagnostics and temperature dials */}
            <div className="flex flex-col space-y-4">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">ESC Engine & Motor Loads</span>
              
              <div className="grid grid-cols-2 gap-4">
                {motorTemp.map((temp, idx) => (
                  <div key={idx} className="border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 rounded-xl p-3 flex justify-between items-center text-xs">
                    <div>
                      <div className="font-bold text-slate-700 dark:text-slate-350">Motor {idx + 1}</div>
                      <div className="text-[10px] text-sky-500 font-bold mt-0.5">{motorRpm[idx]} RPM</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-extrabold ${temp > 55 ? 'text-red-500' : 'text-slate-800 dark:text-slate-200'}`}>{temp}°C</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">Temp</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ESC Loading slider bar */}
              <div className="border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 rounded-xl p-4 space-y-2 text-xs">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-400 font-bold uppercase">ESC Total Power Load</span>
                  <span className={`font-extrabold ${escLoad > 80 ? 'text-red-500 animate-pulse' : 'text-sky-500'}`}>{escLoad}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      escLoad > 80 ? 'bg-red-500' : escLoad > 60 ? 'bg-yellow-500' : 'bg-sky-500'
                    }`} 
                    style={{ width: `${escLoad}%` }} 
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Real-time Vibration spectrum analyzer */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col h-[230px]">
            <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-2">IMU vibration Spectrum (G-Force)</h4>
            <div className="flex-1 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 relative">
              <canvas ref={vibrationCanvasRef} className="w-full h-full" />
              <div className="absolute top-2 left-2 text-[9px] text-slate-400 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">
                Z-Axis frequency FFT bounds: 15-200 Hz
              </div>
            </div>
          </div>

          {/* Autopilot Command Deck */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col h-[230px]">
            <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-3">Autopilot Control Deck</h4>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={handleArmToggle}
                className={`py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 ${
                  isArmed 
                    ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20' 
                    : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20'
                }`}
              >
                <span className="material-symbols-outlined text-sm">{isArmed ? 'dangerous' : 'check_circle'}</span>
                <span>{isArmed ? 'DISARM MOTORS' : 'ARM MOTORS'}</span>
              </button>
              
              <button
                onClick={handleTakeoff}
                disabled={!isArmed}
                className="py-2.5 bg-sky-500 disabled:opacity-50 text-slate-850 font-bold text-xs rounded-xl hover:bg-sky-600 transition-colors flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">flight_takeoff</span>
                <span>Takeoff</span>
              </button>

              <button
                onClick={handleLand}
                disabled={!isArmed}
                className="py-2.5 bg-slate-800 dark:bg-slate-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl hover:bg-slate-900 transition-colors flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">flight_land</span>
                <span>Auto Land</span>
              </button>

              <button
                onClick={handleRTH}
                disabled={!isArmed}
                className="py-2.5 bg-slate-800 dark:bg-slate-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl hover:bg-slate-900 transition-colors flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">cottage</span>
                <span>Go Home Pad</span>
              </button>
            </div>

            {/* Tethered Mode Toggle Button */}
            <div className="mb-4">
              <button
                onClick={() => {
                  if (!isArmed) {
                    alert("Arm the motors first!");
                    return;
                  }
                  const nextTether = !isTethered;
                  setIsTethered(nextTether);
                  if (nextTether) {
                    setFlightState('Tethered Hover');
                    setThrottle(55);
                    setPitch(0);
                    setRoll(0);
                    setLogs(prev => [...prev, '>>> CMD RECEIVED: TETHERED SURVEILLANCE MODE ACTIVATED', 'Continuous high-voltage power line connected. Altitude locked at 15m.']);
                  } else {
                    setFlightState('Hovering');
                    setLogs(prev => [...prev, '>>> CMD RECEIVED: TETHERED SURVEILLANCE MODE DEACTIVATED', 'Switched back to internal battery power supply.']);
                  }
                }}
                disabled={!isArmed}
                className={`w-full py-2 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 ${
                  isTethered
                    ? 'bg-amber-500 text-slate-900 hover:bg-amber-600'
                    : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <span className="material-symbols-outlined text-sm">power</span>
                <span>{isTethered ? 'TETHERED MODE: ACTIVE' : 'ENGAGE TETHERED SURVEILLANCE'}</span>
              </button>
            </div>

            {/* Interactive Throttle slider */}
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400 font-bold uppercase">Throttle Control</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{throttle}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                disabled={!isArmed}
                value={throttle}
                onChange={(e) => setThrottle(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-200 dark:bg-slate-850 rounded-lg appearance-none cursor-pointer accent-sky-500 disabled:opacity-40"
              />
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Terminal Logs, fault injection, wind tunnel */}
      <div className="xl:col-span-4 space-y-6">
        {/* State Alerts display */}
        <div className={`rounded-xl border p-4 text-xs ${
          twinStatus === 'CRITICAL' 
            ? 'bg-red-500/10 border-red-500/30 text-red-500 animate-pulse' 
            : twinStatus === 'WARNING' 
            ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500' 
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
        }`}>
          <div className="flex gap-2 items-center">
            <span className="material-symbols-outlined text-lg">
              {twinStatus === 'CRITICAL' ? 'gpp_bad' : twinStatus === 'WARNING' ? 'warning' : 'security'}
            </span>
            <div>
              <p className="font-bold uppercase tracking-wider">Virtual Twin State: {twinStatus}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {twinStatus === 'CRITICAL' 
                  ? 'Failsafe protocols engaged. Flight system responding.' 
                  : 'All virtual circuits operating within limits.'}
              </p>
            </div>
          </div>
        </div>

        {/* Fault Injection Panel */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-2">Simulate Fault Injections</h4>
          <p className="text-[10px] text-slate-400 mb-3">Manually trigger failures in the simulation matrix to test the flight computer fallback systems.</p>
          
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => handleInjectFault('motor')}
              className="py-2 bg-slate-50 dark:bg-slate-800 hover:bg-red-500/10 hover:text-red-500 text-slate-600 dark:text-slate-350 rounded-lg text-center font-semibold text-[10px] border border-slate-100 dark:border-slate-800 transition-colors"
            >
              Fail Motor 4
            </button>
            <button
              onClick={() => handleInjectFault('lidar')}
              className="py-2 bg-slate-50 dark:bg-slate-800 hover:bg-red-500/10 hover:text-red-500 text-slate-600 dark:text-slate-350 rounded-lg text-center font-semibold text-[10px] border border-slate-100 dark:border-slate-800 transition-colors"
            >
              LiDAR Obstruction
            </button>
            <button
              onClick={() => handleInjectFault('gps')}
              className="py-2 bg-slate-50 dark:bg-slate-800 hover:bg-red-500/10 hover:text-red-500 text-slate-600 dark:text-slate-350 rounded-lg text-center font-semibold text-[10px] border border-slate-100 dark:border-slate-800 transition-colors"
            >
              GPS Jammer Active
            </button>
            <button
              onClick={handleClearFaults}
              className="py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-center font-bold text-[10px] transition-colors"
            >
              Clear Faults Matrix
            </button>
          </div>
        </div>

        {/* Environmental Wind Tunnel settings */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs text-xs space-y-3">
          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider">Wind-Tunnel Simulator</h4>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between items-center text-[10px] mb-1.5">
                <span className="text-slate-400 font-bold uppercase font-mono">Crosswind Speed</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{windSpeed} m/s</span>
              </div>
              <input 
                type="range"
                min="0"
                max="25"
                step="0.5"
                value={windSpeed}
                onChange={(e) => setWindSpeed(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-200 dark:bg-slate-850 rounded-lg appearance-none cursor-pointer accent-sky-500"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-[9px] bg-slate-50 dark:bg-slate-800/30 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 text-slate-400">
              <div>Est. Structural Drag: <span className="font-bold text-slate-700 dark:text-slate-200">{(windSpeed * 0.08).toFixed(2)} N</span></div>
              <div>ESC Power Overhead: <span className="font-bold text-slate-700 dark:text-slate-200">+{Math.round(windSpeed * 1.8)}%</span></div>
            </div>
          </div>
        </div>

        {/* Telemetry Stream Console Output */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-xs flex flex-col h-[200px]">
          <span className="text-[9px] text-sky-400 font-mono font-bold uppercase mb-2">RAW TELEMETRY STREAM (10Hz)</span>
          <div className="flex-1 overflow-y-auto font-mono text-[9px] text-slate-400 space-y-1 scrollbar-thin">
            {logs.map((log, idx) => (
              <div key={idx} className="leading-relaxed break-all text-left">{log}</div>
            ))}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default DigitalTwinSection;
