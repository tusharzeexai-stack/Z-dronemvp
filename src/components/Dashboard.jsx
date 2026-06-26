import React, { useState, useEffect, useRef } from 'react';
import { useAppState } from '../hooks/useAppState';
import { state } from '../js/state';
import TrackingMap from './TrackingMap';
import TelemetryChart from './TelemetryChart';
import { UtilizationChart, BatteryHealthChart } from './AnalyticsCharts';
import Chart from 'chart.js/auto';
import MissionMap from './MissionMap';
import MissionPlannerCard from './MissionPlannerCard';
import UpcomingMissionsWidget from './UpcomingMissionsWidget';
import WeatherWidget from './WeatherWidget';
import LiveStreamViewer from './LiveStreamViewer';
import AnalyticsCenter from './AnalyticsCenter';

// DTLA flight path interpolation
const FLIGHT_PATH = [
  [34.0522, -118.2437],
  [34.0535, -118.2415],
  [34.0550, -118.2400],
  [34.0572, -118.2388],
  [34.0595, -118.2395],
  [34.0610, -118.2415],
  [34.0620, -118.2440],
  [34.0618, -118.2470],
  [34.0605, -118.2495],
  [34.0585, -118.2510],
  [34.0560, -118.2515],
  [34.0535, -118.2505],
  [34.0515, -118.2485],
  [34.0510, -118.2460],
  [34.0522, -118.2437]
];

function interpolatePoints(path, steps = 50) {
  const points = [];
  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i];
    const end = path[i + 1];
    for (let step = 0; step < steps; step++) {
      const ratio = step / steps;
      const lat = start[0] + (end[0] - start[0]) * ratio;
      const lng = start[1] + (end[1] - start[1]) * ratio;
      points.push([lat, lng]);
    }
  }
  points.push(path[path.length - 1]);
  return points;
}
const detailedPath = interpolatePoints(FLIGHT_PATH, 50);

function Dashboard({ onLogout }) {
  const { state: appState, actions } = useAppState();
  
  const [customBackendUrl, setCustomBackendUrl] = useState(() => {
    return localStorage.getItem('z_drone_backend_url') || 'http://127.0.0.1:5000';
  });
  const [backendSettingsOpen, setBackendSettingsOpen] = useState(false);

  // Shared AudioContext ref — created once, reused to avoid autoplay policy errors
  const audioCtxRef = useRef(null);
  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if suspended (Chrome suspends until user gesture)
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  // Helper to dynamically get API base URL to connect to the local server from Vercel/production
  const getApiUrl = (path) => {
    const hostname = window.location.hostname;
    const isLocal = 
      hostname === 'localhost' || 
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.');
      
    if (isLocal) {
      return path;
    }
    // Remove trailing slash if present
    const base = customBackendUrl.replace(/\/$/, '');
    return base + path;
  };

  // Detect if the browser will block the request due to HTTPS mixed content.
  // Browsers CANNOT upgrade HTTP→HTTPS when the target host is a raw IP address.
  const isMixedContentBlocked = () => {
    if (window.location.protocol !== 'https:') return false;
    if (customBackendUrl.startsWith('https://')) return false;
    // http:// + any non-localhost host = blocked
    try {
      const u = new URL(customBackendUrl);
      return u.protocol === 'http:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1';
    } catch { return false; }
  };

  const [activeTab, setActiveTab] = useState('overview'); // Mapped to Zeex AI sections
  const [selectedLiveDroneId, setSelectedLiveDroneId] = useState('');
  const [activeDroneSimId, setActiveDroneSimId] = useState('ZD-109');
  
  // Show warning when page is HTTPS but backend URL is HTTP+IP (browser will block it)
  const showMixedContentWarning = isMixedContentBlocked();
  const [selectedMaintenanceDroneId, setSelectedMaintenanceDroneId] = useState(null);
  
  // Search state
  const [globalSearch, setGlobalSearch] = useState('');
  const [flightSearch, setFlightSearch] = useState('');

  // Dropdown states
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Modals state
  const [addDroneOpen, setAddDroneOpen] = useState(false);
  const [flightPlannerOpen, setFlightPlannerOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);

  // User state
  const [currentUser] = useState(() => {
    try {
      const stored = localStorage.getItem('z_drone_user');
      return stored ? JSON.parse(stored) : { name: 'Admin', role: 'Fleet Manager' };
    } catch {
      return { name: 'Admin', role: 'Fleet Manager' };
    }
  });

  // Forms inputs
  const [newDroneModel, setNewDroneModel] = useState('');
  const [newDroneType, setNewDroneType] = useState('Cargo Delivery');
  const [newDronePayload, setNewDronePayload] = useState('');
  const [newDroneOperator, setNewDroneOperator] = useState('');

  const [newFlightDrone, setNewFlightDrone] = useState('');
  const [newFlightPilot, setNewFlightPilot] = useState('');
  const [newFlightDest, setNewFlightDest] = useState('Westside Hospital Pad');
  const [newFlightPayload, setNewFlightPayload] = useState('');

  // Mission Planner states
  const [missionWaypoints, setMissionWaypoints] = useState([
    { lat: 34.056, lng: -118.245, altitude: 40, action: 'Hover' },
    { lat: 34.058, lng: -118.242, altitude: 50, action: 'Capture Image' }
  ]);
  const [geofenceCoords, setGeofenceCoords] = useState([
    [34.062, -118.252],
    [34.064, -118.240],
    [34.053, -118.234],
    [34.050, -118.246]
  ]);
  const [noFlyZones, setNoFlyZones] = useState([
    { center: [34.052, -118.243], radius: 150, name: "Tall Building Sector A" },
    { center: [34.059, -118.248], radius: 200, name: "Helipad Airspace Delta" }
  ]);
  const [upcomingMissions, setUpcomingMissions] = useState([
    { name: 'Sector Delta Thermal Scan', drone: 'ZD-109', time: '04:30 PM Today', status: 'Scheduled' },
    { name: 'Westside Delivery Cycle', drone: 'ZD-109', time: '06:15 PM Today', status: 'Pending Approval' },
    { name: 'Grid Area Mapping Alpha', drone: 'ZD-088', time: '09:00 AM Tomorrow', status: 'Scheduled' }
  ]);
  const [satelliteMode, setSatelliteMode] = useState(false);

  // SSE telemetry state
  const [liveFps, setLiveFps] = useState('30.0');
  const [livePed, setLivePed] = useState(0);
  const [liveAct, setLiveAct] = useState(0);
  const [liveFrame, setLiveFrame] = useState('0/0');
  const [liveStatus, setLiveStatus] = useState('LIVE');
  const [liveBackend, setLiveBackend] = useState('OpenVINO (Frontend Mode)');
  const [inferencePaused, setInferencePaused] = useState(false);
  const videoRef = useRef(null);

  // CCTV Configuration settings state
  const [frameSkip, setFrameSkip] = useState(1);
  const [confThreshold, setConfThreshold] = useState(0.4);
  const [inferenceMode, setInferenceMode] = useState(3);
  const [videoPath, setVideoPath] = useState('cam1.mp4');
  const [videoSources, setVideoSources] = useState([
    { value: 'cam1.mp4', label: '📹 Sector Delta — cam1.mp4 (Recorded/Annotated)' },
    { value: 'cam2.mp4', label: '📹 Sector Charlie — cam2.mp4 (New Footage)' }
  ]);

  // Chart ref for AI Inference tab
  const aiChartCanvasRef = useRef(null);
  const aiChartRef = useRef(null);
  const chartLabelsRef = useRef([]);
  const chartPedsRef = useRef([]);
  const chartActsRef = useRef([]);
  const sseSourceRef = useRef(null);
  const sseReconnectTimerRef = useRef(null);
  const sseReconnectDelayRef = useRef(1000); // start at 1s, exponential backoff

  // Sync theme to document element
  useEffect(() => {
    if (appState.settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [appState.settings.theme]);

  // Initialize default live monitoring drone
  useEffect(() => {
    if (!selectedLiveDroneId && appState.drones.length > 0) {
      setSelectedLiveDroneId(appState.drones[0].id);
    }
  }, [appState.drones, selectedLiveDroneId]);

  // Fetch initial list of drones from backend database
  useEffect(() => {
    fetch(getApiUrl('/drones'))
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Failed to load drones');
      })
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          actions.setDrones(data);
        }
      })
      .catch(err => console.warn('Could not sync drones with backend:', err));
  }, []);

  // Connect SSE (disabled for frontend-only mode)
  useEffect(() => {
    // connectSSE();
    return () => {
      if (sseSourceRef.current) sseSourceRef.current.close();
      if (sseReconnectTimerRef.current) clearTimeout(sseReconnectTimerRef.current);
    };
  }, []);

  // Initialize AI Inference Chart when in live CCTV view
  // Also dynamically fetch available video list from backend
  useEffect(() => {
    if (activeTab === 'cctv' || activeTab === 'live_mon') {
      // Fetch available video sources from backend
      fetch(getApiUrl('/api/videos'))
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) setVideoSources(data);
        })
        .catch(() => {}); // silent fallback to default list

      // Push current video selection to backend immediately
      fetch(getApiUrl('/api/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_path: videoPath })
      }).catch(() => {});

      setTimeout(() => {
        initAiInferenceChart();
      }, 200);
    }
    return () => {
      if (aiChartRef.current) {
        aiChartRef.current.destroy();
        aiChartRef.current = null;
      }
    };
  }, [activeTab]);

  const connectSSE = () => {
    if (sseSourceRef.current) sseSourceRef.current.close();
    
    // Connect to proxy stats_feed
    const sse = new EventSource(getApiUrl('/stats_feed'));
    sseSourceRef.current = sse;

    sse.onmessage = (e) => {
      let d;
      try {
        d = JSON.parse(e.data);
      } catch (_) {
        return;
      }

      setLiveFps(d.fps.toFixed(1));
      setLivePed(d.ped_count);
      setLiveAct(d.act_count);
      setLiveFrame(`${d.frame_idx}/${d.total_frames}`);
      setLiveStatus(d.status === 'Paused' ? 'PAUSED' : 'LIVE');
      if (d.backend) setLiveBackend(d.backend);
      const isServerPaused = d.status === 'Paused';
      setInferencePaused(isServerPaused);

      // Slide coordinates marker
      let currentCoord = [34.0522, -118.2437];
      if (d.total_frames > 0) {
        const pathIdx = Math.min(detailedPath.length - 1, Math.floor((d.frame_idx / d.total_frames) * detailedPath.length));
        currentCoord = detailedPath[pathIdx];
        if (currentCoord && window.droneMarker) {
          window.droneMarker.setLatLng(currentCoord);
        }
      }

      // Sync active drone telemetry
      const targetDrone = appState.drones.find(x => x.id === 'ZD-109');
      if (targetDrone) {
        const speedFluctuation = (Math.random() - 0.5) * 1.5;
        const altFluctuation = (Math.random() - 0.5) * 2;
        const nextSpeed = Math.max(8, Math.min(20, parseFloat((targetDrone.speed + speedFluctuation).toFixed(1))));
        const nextAlt = Math.max(35, Math.min(65, parseFloat((targetDrone.altitude + altFluctuation).toFixed(1))));
        const nextBattery = Math.max(0, parseFloat((targetDrone.battery - 0.05).toFixed(2)));

        actions.updateDroneTelemetry('ZD-109', {
          lat: parseFloat(currentCoord[0].toFixed(5)),
          lng: parseFloat(currentCoord[1].toFixed(5)),
          speed: nextSpeed,
          altitude: nextAlt,
          battery: nextBattery,
          status: 'Online'
        });

        // Feed rolling telemetry charts
        if (!isServerPaused && window.updateTelemetryChart) {
          window.updateTelemetryChart(nextAlt, nextSpeed);
        }
      }

      // Security intrusion alerts trigger
      if (d.ped_count > 0) {
        const hasWarning = appState.alerts.some(a => a.unit === 'ZD-109' && a.title === 'Security Intrusion' && !a.resolved);
        if (!hasWarning) {
          const alertId = `ALT-SEC-${d.frame_idx}-${Math.floor(1000 + Math.random() * 9000)}`;
          const totalFrames = d.total_frames || 2253;
          const duration = 145;
          const startSec = Math.max(0, Math.floor((d.frame_idx / totalFrames) * duration) - 2);
          const endSec = Math.min(duration, startSec + 5);

          const newAlert = {
            id: alertId,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            unit: 'ZD-109',
            type: 'battery_alert',
            title: 'Security Intrusion',
            description: `Warning: ${d.ped_count} unauthorized human presence detected by drone ZD-109 in Sector Alpha!`,
            severity: 'error',
            resolved: false,
            videoUrl: `/cam2.mp4#t=${startSec},${endSec}`
          };
          appState.alerts.unshift(newAlert);
          localStorage.setItem('z_drone_alerts', JSON.stringify(appState.alerts));
          try { state.triggerUpdate(); } catch(_) {} // force broadcast

          if (appState.settings.soundsEnabled) {
            playWarningBeep();
          }
        }
      }

      // Update AI Inference Chart
      if (d.frame_idx > 0 && aiChartRef.current) {
        chartLabelsRef.current.push('F' + d.frame_idx);
        chartPedsRef.current.push(d.ped_count);
        chartActsRef.current.push(d.act_count);
        if (chartLabelsRef.current.length > 50) {
          chartLabelsRef.current.shift();
          chartPedsRef.current.shift();
          chartActsRef.current.shift();
        }
        aiChartRef.current.update('none');
      }
    };

    sse.onerror = () => {
      setLiveStatus('OFFLINE');
      sse.close();
      sseSourceRef.current = null;
      // Exponential backoff reconnect (1s → 2s → 4s … max 30s)
      const delay = sseReconnectDelayRef.current;
      console.warn(`[SSE] Connection lost. Reconnecting in ${delay}ms…`);
      sseReconnectTimerRef.current = setTimeout(() => {
        sseReconnectDelayRef.current = Math.min(delay * 2, 30000);
        connectSSE();
      }, delay);
    };

    // Reset backoff on successful first message
    const origOnMessage = sse.onmessage;
    sse.onmessage = (e) => {
      sseReconnectDelayRef.current = 1000; // reset backoff on success
      if (origOnMessage) origOnMessage(e);
    };
  };

  const playWarningBeep = () => {
    try {
      // Use shared AudioContext — avoids Chrome autoplay policy error
      const context = getAudioContext();
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.connect(gain);
      gain.connect(context.destination);
      osc.frequency.setValueAtTime(660, context.currentTime);
      gain.gain.setValueAtTime(0.08, context.currentTime);
      osc.start();
      osc.stop(context.currentTime + 0.15);
    } catch (_) {}
  };

  const playCalibrationBeep = () => {
    try {
      // Use shared AudioContext — avoids Chrome autoplay policy error
      const context = getAudioContext();
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.connect(gain);
      gain.connect(context.destination);
      osc.frequency.setValueAtTime(880, context.currentTime);
      gain.gain.setValueAtTime(0.05, context.currentTime);
      osc.start();
      osc.stop(context.currentTime + 0.1);
    } catch (_) {}
  };

  const initAiInferenceChart = () => {
    if (!aiChartCanvasRef.current) return;
    const ctx = aiChartCanvasRef.current.getContext('2d');
    const isDark = appState.settings.theme === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    const tickColor = isDark ? 'rgba(255,255,255,0.4)' : '#94a3b8';

    if (aiChartRef.current) aiChartRef.current.destroy();

    aiChartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartLabelsRef.current,
        datasets: [
          {
            label: 'Pedestrians',
            data: chartPedsRef.current,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16,185,129,0.08)',
            borderWidth: 2,
            tension: 0.35,
            fill: true,
            pointRadius: 0
          },
          {
            label: 'Actions',
            data: chartActsRef.current,
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245,158,11,0.08)',
            borderWidth: 2,
            tension: 0.35,
            fill: true,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false, grid: { color: gridColor } },
          y: {
            min: 0,
            suggestedMax: 5,
            grid: { color: gridColor },
            ticks: { color: tickColor, stepSize: 1, font: { size: 9 } }
          }
        }
      }
    });
  };

  // API Call helper
  const postApi = (path, body = {}) => {
    fetch(getApiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).catch(() => {});
  };

  const handleTimeUpdate = (e) => {
    const video = e.target;
    if (!video.duration) return;

    const fps = 30.0;
    const currentFrame = Math.floor(video.currentTime * fps);
    const totalFrames = Math.floor(video.duration * fps);

    setLiveFrame(`${currentFrame}/${totalFrames}`);
    setLiveFps((29.5 + Math.random() * 1.0).toFixed(1));

    // Generate realistic pedestrian and action counts based on current video time
    const t = video.currentTime;
    const pedCount = Math.floor(2 + Math.sin(t * 0.4) * 2);
    const actCount = Math.floor(1 + Math.cos(t * 0.6) * 1);

    setLivePed(pedCount);
    setLiveAct(actCount);

    // Feed AI charts
    if (aiChartRef.current && !inferencePaused) {
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (chartLabelsRef.current[chartLabelsRef.current.length - 1] !== timeStr) {
        chartLabelsRef.current.push(timeStr);
        chartPedsRef.current.push(pedCount);
        chartActsRef.current.push(actCount);
        if (chartLabelsRef.current.length > 50) {
          chartLabelsRef.current.shift();
          chartPedsRef.current.shift();
          chartActsRef.current.shift();
        }
        aiChartRef.current.update('none');
      }
    }

    // Slide coordinates marker (DTLA flight path interpolation)
    let currentCoord = [34.0522, -118.2437];
    if (totalFrames > 0) {
      const pathIdx = Math.min(detailedPath.length - 1, Math.floor((currentFrame / totalFrames) * detailedPath.length));
      currentCoord = detailedPath[pathIdx];
      if (currentCoord && window.droneMarker) {
        window.droneMarker.setLatLng(currentCoord);
      }
    }

    // Sync active drone telemetry
    const targetDrone = appState.drones.find(x => x.id === 'ZD-109');
    if (targetDrone) {
      const speedFluctuation = (Math.random() - 0.5) * 1.5;
      const altFluctuation = (Math.random() - 0.5) * 2;
      const nextSpeed = Math.max(8, Math.min(20, parseFloat((targetDrone.speed + speedFluctuation).toFixed(1))));
      const nextAlt = Math.max(35, Math.min(65, parseFloat((targetDrone.altitude + altFluctuation).toFixed(1))));
      const nextBattery = Math.max(0, parseFloat((targetDrone.battery - 0.05).toFixed(2)));

      actions.updateDroneTelemetry('ZD-109', {
        lat: parseFloat(currentCoord[0].toFixed(5)),
        lng: parseFloat(currentCoord[1].toFixed(5)),
        speed: nextSpeed,
        altitude: nextAlt,
        battery: nextBattery,
        status: 'Online'
      });

      // Feed rolling telemetry charts
      if (window.updateTelemetryChart) {
        window.updateTelemetryChart(nextAlt, nextSpeed);
      }
    }
  };

  const handleTogglePlay = () => {
    const nextPaused = !inferencePaused;
    setInferencePaused(nextPaused);
    postApi('/api/settings', { paused: nextPaused });
    if (videoRef.current) {
      if (nextPaused) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
      }
    }
  };

  const handleReset = () => {
    postApi('/api/reset');
    chartLabelsRef.current = [];
    chartPedsRef.current = [];
    chartActsRef.current = [];
    if (aiChartRef.current) aiChartRef.current.update();
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
      setInferencePaused(false);
    }
  };

  const handleSetSpeed = (speedVal) => {
    setFrameSkip(parseInt(speedVal));
    postApi('/api/settings', { frame_skip: parseInt(speedVal) });
    if (videoRef.current) {
      const speed = parseInt(speedVal) === 1 ? 1.0 : parseInt(speedVal) === 2 ? 1.5 : 2.0;
      videoRef.current.playbackRate = speed;
    }
  };

  const handleSetConf = (confVal) => {
    setConfThreshold(parseFloat(confVal));
    postApi('/api/settings', { conf_threshold: parseFloat(confVal) });
  };

  const handleSetMode = (modeVal) => {
    setInferenceMode(modeVal);
    postApi('/api/settings', { mode: modeVal });
  };

  const handleSetVideo = (videoVal) => {
    setVideoPath(videoVal);
    postApi('/api/settings', { video_path: videoVal });
    chartLabelsRef.current = [];
    chartPedsRef.current = [];
    chartActsRef.current = [];
    if (aiChartRef.current) aiChartRef.current.update();
    if (videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  };

  // Actions
  const handleGroundDrone = (droneId) => {
    actions.updateDroneTelemetry(droneId, {
      status: 'Maintenance',
      altitude: 0,
      speed: 0,
      signal: 'None'
    });
  };

  const handleRunCalibration = (droneId, system) => {
    actions.performCalibration(droneId, system);
    if (appState.settings.soundsEnabled) {
      playCalibrationBeep();
    }
  };

  const handleAddDrone = async (e) => {
    e.preventDefault();
    const droneData = {
      model: newDroneModel,
      type: newDroneType,
      payload: newDronePayload,
      operator: newDroneOperator
    };

    try {
      const response = await fetch(getApiUrl('/drones'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(droneData)
      });
      
      if (response.ok) {
        const createdDrone = await response.json();
        // Add to local state (will keep the backend generated ID)
        actions.addDrone(createdDrone);
        // Select this drone in Live Monitoring
        setSelectedLiveDroneId(createdDrone.id);
      } else {
        console.warn('Backend rejected registration, falling back to local simulation');
        actions.addDrone(droneData);
      }
    } catch (err) {
      console.error('Failed to post drone to backend:', err);
      actions.addDrone(droneData);
    }

    // Reset fields and close modal
    setNewDroneModel('');
    setNewDronePayload('');
    setNewDroneOperator('');
    setAddDroneOpen(false);

    // Switch tab to Live Monitoring immediately
    setActiveTab('live_mon');
  };

  const handleDispatchFlight = (e) => {
    e.preventDefault();
    if (!newFlightDrone) return;
    actions.addFlight({
      drone: newFlightDrone,
      pilot: newFlightPilot,
      destination: newFlightDest,
      payload: newFlightPayload,
      status: 'In Progress'
    });
    setNewFlightPilot('');
    setNewFlightPayload('');
    setFlightPlannerOpen(false);
    setActiveDroneSimId(newFlightDrone);
  };

  const handleTrackDrone = (droneId) => {
    setActiveDroneSimId(droneId);
    setActiveTab('overview');
    setTimeout(() => {
      if (window.focusOnDrone) window.focusOnDrone();
    }, 100);
  };

  // Derived values - MUST be defined before sidebarMenu
  const activeAlerts = appState.alerts.filter(a => !a.resolved);

  // Sidebar Menu Array
  const sidebarMenu = [
    { id: 'overview', label: 'Dashboard', icon: 'dashboard' },
    { id: 'cctv', label: 'AI Inference', icon: 'smart_toy', badgeText: 'LIVE' },
    { id: 'machines', label: 'Drones', icon: 'flight_takeoff' },
    { id: 'reports', label: 'Flights', icon: 'route' },
    { id: 'mission_planner', label: 'Mission Planner', icon: 'explore' },
    { id: 'live_mon', label: 'Live Monitoring', icon: 'sensors' },
    { id: 'analytics', label: 'Analytics', icon: 'analytics' },
    { id: 'safety', label: 'Alerts', icon: 'notifications', badge: activeAlerts.length },
    { id: 'maintenance', label: 'Maintenance', icon: 'build' }
  ];

  // Active Drone Telemetry variables
  const activeDrone = appState.drones.find(d => d.id === activeDroneSimId) || appState.drones[0];

  // Filtered lists
  const filteredDrones = appState.drones.filter(d =>
    d.id.toLowerCase().includes(globalSearch.toLowerCase()) ||
    d.model.toLowerCase().includes(globalSearch.toLowerCase()) ||
    d.type.toLowerCase().includes(globalSearch.toLowerCase())
  );

  const activeAlertsCount = activeAlerts.length;


  return (
    <>
      <div className="flex h-screen overflow-hidden bg-sky-50/30 dark:bg-[#081C2C]">
      {/* ===== SIDEBAR (Zeex AI Platform) ===== */}
      <aside className="w-64 bg-white dark:bg-slate-900 border-r border-sky-100 dark:border-slate-800 text-sky-900 dark:text-slate-100 flex flex-col shrink-0">
        {/* Brand Header */}
        <div className="p-4 border-b border-sky-100 dark:border-slate-800 text-left flex items-center gap-3">
          <img 
            src="/Z-Drone logo.png" 
            alt="Z-DRONE Logo" 
            className="w-10 h-10 rounded-lg object-contain bg-slate-50 dark:bg-slate-800 p-0.5 border border-sky-100 dark:border-slate-800 shrink-0"
          />
          <div>
            <h1 className="font-extrabold text-sky-600 dark:text-sky-400 text-base tracking-tight leading-none uppercase">Z-DRONE</h1>
            <p className="text-[9px] text-sky-400 mt-1 uppercase font-bold tracking-widest">Fleet Management</p>
          </div>
        </div>

        {/* Brand Search */}
        <div className="px-4 py-3">
          <div className="relative flex items-center bg-sky-50/50 dark:bg-slate-800 rounded-lg px-3 py-1.5 border border-sky-100 dark:border-slate-700">
            <span className="material-symbols-outlined text-sky-400 text-sm">search</span>
            <input 
              type="text" 
              placeholder="Search drones, flights, or alerts..." 
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="bg-transparent border-none text-xs focus:ring-0 focus:outline-none w-full text-sky-900 dark:text-white placeholder:text-sky-400 pl-1"
            />
            <span className="px-1 py-0.5 rounded bg-sky-100 dark:bg-slate-700 text-[10px] text-sky-600 dark:text-sky-300 border border-sky-200 dark:border-slate-600 font-semibold">⌘K</span>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5 scrollbar-thin">
          {sidebarMenu.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-left ${
                  isActive 
                    ? 'bg-sky-500 text-white font-bold border-l-4 border-sky-600 shadow-sm shadow-sky-100 dark:shadow-none' 
                    : 'hover:bg-sky-50/80 dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-sky-300 text-sky-800 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-lg">{item.icon}</span>
                  <span className="text-xs font-semibold">{item.label}</span>
                </div>
                {item.badgeText && (
                  <span className="px-1.5 py-0.5 bg-sky-400 text-white text-[8px] font-extrabold rounded uppercase tracking-wider">{item.badgeText}</span>
                )}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="px-2 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full">{item.badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Users & Logout at the bottom */}
        <div className="p-3 border-t border-sky-100 dark:border-slate-800 flex flex-col gap-1.5">
          <button
            onClick={() => setActiveTab('employee')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
              activeTab === 'employee'
                ? 'bg-sky-500 text-white font-bold border-l-4 border-sky-600 shadow-sm shadow-sky-100 dark:shadow-none' 
                : 'hover:bg-sky-50/80 dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-sky-300 text-sky-800 dark:text-slate-300'
            }`}
          >
            <span className="material-symbols-outlined text-lg">group</span>
            <span className="text-xs font-semibold">Users</span>
          </button>

          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left text-red-650 hover:bg-red-50 dark:hover:bg-red-950/20 dark:text-red-400 hover:text-red-700 font-semibold"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            <span className="text-xs font-semibold">Logout</span>
          </button>
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-sky-100 dark:border-slate-800 flex items-center justify-between text-xs text-sky-400 dark:text-slate-400">
          <span>Version 1.2.0</span>
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
        </div>
      </aside>

      {/* ===== MAIN CONTENT WRAPPER ===== */}
      <div className="flex-1 flex flex-col overflow-hidden">
         {/* TOP NAVBAR */}
        <header className="h-16 border-b border-sky-100 dark:border-sky-900/40 bg-white/95 dark:bg-[#0c4a6e]/20 backdrop-blur-md flex items-center justify-between px-6 z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white capitalize">
              {sidebarMenu.find(x => x.id === activeTab)?.label}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            {/* Backend URL Settings */}
            <div className="relative">
              <button 
                onClick={() => { setBackendSettingsOpen(!backendSettingsOpen); setNotifOpen(false); setProfileOpen(false); }}
                className={`p-2 rounded-lg border hover:bg-sky-50 dark:hover:bg-sky-900/30 flex items-center justify-center relative ${
                  liveStatus === 'OFFLINE' 
                    ? 'border-red-200 text-red-500 bg-red-50/10' 
                    : 'border-sky-100 dark:border-sky-900/50 text-sky-600 dark:text-sky-300'
                }`}
                title="Configure Backend Connection"
              >
                <span className="material-symbols-outlined text-lg">
                  {liveStatus === 'OFFLINE' ? 'wifi_off' : 'wifi'}
                </span>
              </button>

              {backendSettingsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#0c4a6e] border border-sky-100 dark:border-sky-900/60 rounded-xl shadow-xl z-50 overflow-hidden text-slate-800 dark:text-white">
                  <div className="px-4 py-3 border-b border-sky-100 dark:border-sky-900/40 bg-sky-50/50 dark:bg-sky-950/20">
                    <span className="font-bold text-xs">Backend Connection Settings</span>
                  </div>
                  <div className="p-4 flex flex-col gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                        Inference Server URL
                      </label>
                      <input 
                        type="text" 
                        value={customBackendUrl}
                        onChange={(e) => {
                          setCustomBackendUrl(e.target.value);
                          localStorage.setItem('z_drone_backend_url', e.target.value);
                        }}
                        placeholder="http://127.0.0.1:5000"
                        className="w-full text-xs px-3 py-2 rounded-lg border border-sky-100 dark:border-sky-900/60 bg-sky-50/20 dark:bg-sky-950/30 text-slate-800 dark:text-white focus:outline-none focus:border-sky-400"
                      />
                    </div>
                    {showMixedContentWarning && (
                      <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-2.5 flex flex-col gap-1">
                        <p className="text-[9px] text-red-600 dark:text-red-400 font-bold leading-normal">
                          🚫 Blocked: This page is HTTPS but your backend URL uses HTTP + an IP address.
                        </p>
                        <p className="text-[9px] text-red-500 dark:text-red-400 leading-normal">
                          Browsers cannot upgrade HTTP→HTTPS for raw IP addresses. All requests will fail with <code className="font-mono">ERR_MIXED_CONTENT</code>.
                        </p>
                        <p className="text-[9px] text-red-500 dark:text-red-400 font-semibold leading-normal">
                          ✅ Fix: Use your HTTPS tunnel URL instead (e.g. <code className="font-mono">https://xxxx.lhr.life</code> or ngrok).
                        </p>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 leading-normal">
                      {window.location.protocol === 'https:'
                        ? <>⚠️ Page is on HTTPS — backend URL <strong>must</strong> use <code className="text-sky-500">https://</code>. Use a tunnel like <code className="text-sky-500">lhr.life</code> or <code className="text-sky-500">ngrok</code>.</>
                        : <>On other devices (same WiFi), enter your PC IP e.g. <code className="text-sky-500">http://192.168.1.178:5000</code>. On different networks, use an HTTPS tunnel URL.</>
                      }
                    </p>
                    <button 
                      onClick={() => {
                        setBackendSettingsOpen(false);
                        connectSSE(); // reconnect
                      }}
                      className="w-full py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-semibold text-xs transition-colors"
                    >
                      Apply & Reconnect
                    </button>
                  </div>
                </div>
              )}
            </div>



            {/* Notification bell */}
            <div className="relative">
              <button 
                onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
                className="p-2 rounded-lg border border-sky-100 dark:border-sky-900/50 hover:bg-sky-50 dark:hover:bg-sky-900/30 text-sky-600 dark:text-sky-300 relative"
              >
                <span className="material-symbols-outlined text-lg">notifications</span>
                {activeAlerts.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#0c4a6e] border border-sky-100 dark:border-sky-900/60 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-sky-100 dark:border-sky-900/40 flex justify-between items-center bg-sky-50/50 dark:bg-sky-950/20">
                    <span className="font-bold text-xs text-slate-700 dark:text-white">Active Notifications</span>
                    <button 
                      onClick={() => { actions.resolveAllAlerts(); setNotifOpen(false); }}
                      className="text-[10px] text-sky-600 dark:text-sky-300 hover:underline font-semibold"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-sky-100 dark:divide-sky-900/40">
                    {activeAlerts.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500">No warnings logged</div>
                    ) : (
                      activeAlerts.map(alert => (
                        <div key={alert.id} className="p-3 hover:bg-sky-50/50 dark:hover:bg-sky-950/30 flex justify-between gap-2">
                          <div className="text-left">
                            <p className="text-xs font-bold text-slate-800 dark:text-white">{alert.title}</p>
                            <p className="text-[10px] text-slate-500 mt-1">{alert.description}</p>
                          </div>
                          <button 
                            onClick={() => actions.resolveAlert(alert.id)}
                            className="text-[10px] text-sky-600 dark:text-sky-300 hover:underline h-fit self-center shrink-0"
                          >
                            Resolve
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Dropdown */}
            <div className="relative">
              <button 
                onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
                className="flex items-center gap-2 border border-sky-100 dark:border-sky-900/50 rounded-lg p-1.5 hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-colors"
              >
                <img 
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBijJZddpbaAwXrMcKxkk4y5a8XK3TNesNW3AycY6mN2XMSPWhi-KOtgNnDLiV7jx7kJRTX8NreKaVxQeo6CFq-GUV4ewnI2U6Vb1rZ90U3HS2UdQ6RwMHkl8qlfM-aPxnBmFCzL8Jb2Coc0PUZEMekUHPT5KHuRTpRndBVSNGdP9wR1kvr-E2RJst4YVbbbMsSyh05z_ZwxxiBlxAZOdc_RkAy5OP3aU9gZF1k_fjuiztN5z-x2YDpQGWd0_coz4R7mUbce-uDKmA" 
                  alt="avatar" 
                  className="w-7 h-7 rounded-full object-cover"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 hidden md:block">{currentUser.name || 'Admin'}</span>
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#0c4a6e] border border-sky-100 dark:border-sky-900/60 rounded-xl shadow-xl z-50 py-2">
                  <div className="px-4 py-2 border-b border-sky-100 dark:border-sky-900/40 text-left">
                    <p className="text-xs font-bold text-slate-800 dark:text-white">{currentUser.name || 'Admin'}</p>
                    <p className="text-[10px] text-slate-500">{currentUser.role || 'Fleet Manager'}</p>
                  </div>
                  <button 
                    onClick={onLogout}
                    className="w-full text-left px-4 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 flex items-center gap-2 mt-1"
                  >
                    <span className="material-symbols-outlined text-sm">logout</span>
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* MAIN BODY AREA */}
        <main className="flex-1 overflow-y-auto p-6 max-w-[1600px] mx-auto w-full">
          {/* TAB 1: OVERVIEW DASHBOARD */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* KPIs */}
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  { title: 'Total Flights', val: appState.flights.length, icon: 'flight_takeoff', color: 'text-sky-500', path: 'M0,15 Q10,5 20,12 T40,8 T60,15 T80,5 T100,10' },
                  { title: 'Flight Time', val: `${Math.floor(detailedPath.length / 3.0 / 60)}m 12s`, icon: 'schedule', color: 'text-sky-500', path: 'M0,10 L10,8 L20,14 L30,5 L40,12 L50,10 L60,18 L70,12 L80,15 L90,8 L100,10' },
                  { title: 'Distance Flown', val: '12.40 km', icon: 'route', color: 'text-sky-500', path: 'M0,18 L20,15 L40,17 L60,8 L80,5 L100,2' },
                  { title: 'Images Captured', val: '1,432', icon: 'photo_library', color: 'text-sky-500', path: 'M0,10 Q25,10 50,5 T100,15' },
                  { title: 'Active Alerts', val: activeAlerts.length, icon: 'warning', color: 'text-red-500 animate-pulse', path: 'M0,15 L10,5 L20,15 L30,5 L40,15 L50,5 L60,15 L70,5 L80,15 L90,5 L100,15', border: 'border-l-4 border-l-red-500' }
                ].map((kpi, idx) => (
                  <div key={idx} className={`bg-white dark:bg-[#1E293B] p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 hover:shadow-md transition-all flex flex-col justify-between ${kpi.border || ''}`}>
                    <div className="flex justify-between items-start">
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{kpi.title}</p>
                      <span className={`material-symbols-outlined text-lg ${kpi.color}`}>{kpi.icon}</span>
                    </div>
                    <h3 className="font-extrabold text-2xl text-slate-800 dark:text-white mt-2">{kpi.val}</h3>
                    <div className="h-6 mt-3">
                      <svg className="w-full h-full fill-none stroke-current stroke-[1.5]" viewBox="0 0 100 20" style={{ color: idx === 4 ? '#ef4444' : '#38bdf8' }}>
                        <path d={kpi.path}></path>
                      </svg>
                    </div>
                  </div>
                ))}
              </section>

              {/* Map & Live telemetry grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Tracking Map card */}
                <div className="col-span-12 lg:col-span-7 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden p-4">
                  <header className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-sky-500">my_location</span>
                      <h3 className="font-bold text-slate-800 dark:text-white">Active Flight Tracking Map</h3>
                    </div>
                    <span className="text-[10px] bg-sky-500/10 text-sky-500 font-bold rounded px-2 py-0.5">LA DOWNTOWN</span>
                  </header>
                  <div className="w-full h-[400px] relative">
                    <TrackingMap detailedPath={detailedPath} />
                  </div>
                </div>

                {/* Drone HUD / Telemetry card */}
                <div className="col-span-12 lg:col-span-5 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <header className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
                      <div>
                        <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                          <span>Unit Status HUD: {activeDrone.id}</span>
                        </h4>
                        <p className="text-[10px] text-slate-500">{activeDrone.model}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        activeDrone.status === 'Online' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400' :
                        activeDrone.status === 'Maintenance' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400' :
                        'bg-slate-100 text-slate-700'
                      }`}>{activeDrone.status}</span>
                    </header>

                    {/* HUD metrics */}
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: 'Altitude', val: `${activeDrone.altitude} m`, icon: 'airwave' },
                        { label: 'Air Speed', val: `${activeDrone.speed} m/s`, icon: 'speed' },
                        { label: 'Signal Quality', val: activeDrone.signal, icon: 'wifi' },
                        { label: 'Coordinates', val: `${activeDrone.lat.toFixed(4)}, ${activeDrone.lng.toFixed(4)}`, icon: 'location_on' }
                      ].map((hud, hIdx) => (
                        <div key={hIdx} className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800/80">
                          <span className="text-[10px] text-slate-500 font-semibold">{hud.label}</span>
                          <p className="font-bold text-sm text-slate-800 dark:text-white mt-1 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-slate-400 text-sm">{hud.icon}</span>
                            <span>{hud.val}</span>
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Battery Bar */}
                    <div className="mt-6 space-y-2">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-500">Lithium Cell Level</span>
                        <span className={activeDrone.battery < 20 ? 'text-red-500 animate-pulse' : 'text-slate-800 dark:text-white'}>
                          {Math.round(activeDrone.battery)}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-200/50 dark:border-slate-700/50">
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${activeDrone.battery < 20 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}
                          style={{ width: `${activeDrone.battery}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-6">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Current Task Overlay</span>
                    <p className="text-xs font-bold text-slate-800 dark:text-white mt-1 bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                      {activeDrone.status === 'Online' ? `Dispatch Mission: ${activeDrone.payload} ➔ ${activeDrone.destination}` : 'Charging / Static Standby'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Charts & Alerts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Real-time scrolling chart */}
                <div className="col-span-12 lg:col-span-8 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <header className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-sky-500">show_chart</span>
                      <h4 className="font-bold text-slate-800 dark:text-white">Active Flight Real-time Telemetry (Alt / Speed)</h4>
                    </div>
                  </header>
                  <div className="h-64">
                    <TelemetryChart />
                  </div>
                </div>

                {/* Alerts list timeline & Mission/Weather widgets */}
                <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
                  {/* Alerts list timeline */}
                  <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col">
                    <header className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-red-500">notifications_active</span>
                        <h4 className="font-bold text-slate-800 dark:text-white">Security Alerts Log</h4>
                      </div>
                    </header>
                    <div className="flex-1 overflow-y-auto space-y-4 max-h-[250px] pr-2 scrollbar-thin">
                      {activeAlerts.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-500 flex flex-col items-center">
                          <span className="material-symbols-outlined text-emerald-500 text-3xl mb-2">check_circle</span>
                          <p className="font-semibold">Network Clear</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Drones running clean telemetry.</p>
                        </div>
                      ) : (
                        activeAlerts.map((alert, idx) => (
                          <div key={`${alert.id}-${idx}`} className="flex gap-3 text-left">
                            <div className="flex flex-col items-center">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                alert.severity === 'error' ? 'bg-red-50 dark:bg-red-950/20 text-red-500' :
                                alert.severity === 'warning' ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-500' :
                                'bg-emerald-50 text-emerald-500'
                              }`}>
                                <span className="material-symbols-outlined text-base">
                                  {alert.severity === 'error' ? 'battery_alert' : alert.severity === 'warning' ? 'air' : 'check_circle'}
                                </span>
                              </div>
                            </div>
                            <div className="flex-1">
                              <span className="text-[9px] text-slate-400 font-semibold">{alert.time} • Unit: {alert.unit}</span>
                              <div className="flex justify-between items-start gap-1">
                                <h5 className="font-bold text-xs text-slate-800 dark:text-white">{alert.title}</h5>
                                <div className="flex gap-2 shrink-0">
                                  <button 
                                    onClick={() => setSelectedAlert(alert)}
                                    className="text-[10px] text-sky-500 hover:underline font-semibold flex items-center gap-0.5"
                                  >
                                    <span className="material-symbols-outlined text-[10px]">visibility</span>
                                    <span>View</span>
                                  </button>
                                  <button 
                                    onClick={() => actions.resolveAlert(alert.id)}
                                    className="text-[10px] text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 font-semibold"
                                  >
                                    Ack
                                  </button>
                                </div>
                              </div>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{alert.description}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Upcoming Missions */}
                  <UpcomingMissionsWidget missions={upcomingMissions} />

                  {/* Weather Conditions Widget */}
                  <WeatherWidget />
                </div>
              </div>

              {/* Recent flight logs */}
              <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <header className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sky-500">list_alt</span>
                    <h3 className="font-bold text-slate-800 dark:text-white">Active Flight Plan Overview</h3>
                  </div>
                  <button 
                    onClick={() => setActiveTab('reports')}
                    className="text-xs text-sky-500 hover:underline font-semibold"
                  >
                    View All Logs
                  </button>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                        <th className="px-4 py-2.5">Flight ID</th>
                        <th className="px-4 py-2.5">Drone ID</th>
                        <th className="px-4 py-2.5">Date</th>
                        <th className="px-4 py-2.5">Duration</th>
                        <th className="px-4 py-2.5">Distance</th>
                        <th className="px-4 py-2.5">Pilot</th>
                        <th className="px-4 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {appState.flights.slice(0, 4).map(flight => (
                        <tr 
                          key={flight.id} 
                          onClick={() => handleTrackDrone(flight.drone)}
                          className="hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3 font-bold text-slate-800 dark:text-white">{flight.id}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-semibold">{flight.drone}</td>
                          <td className="px-4 py-3 text-slate-500">{flight.date}</td>
                          <td className="px-4 py-3 text-slate-500">{flight.duration}</td>
                          <td className="px-4 py-3 text-slate-500">{flight.distance}</td>
                          <td className="px-4 py-3 text-slate-500">{flight.pilot}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              flight.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900' :
                              flight.status === 'In Progress' ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-900 animate-pulse' :
                              flight.status === 'Aborted' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900' :
                              'bg-slate-50 text-slate-700 border-slate-200'
                            }`}>{flight.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: MISSION PLANNER */}
          {activeTab === 'mission_planner' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-120px)] min-h-[500px]">
              {/* Left Section (60%): Interactive Map */}
              <div className="col-span-12 lg:col-span-7 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden p-4 flex flex-col justify-between h-full">
                <header className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sky-500">near_me</span>
                    <h3 className="font-bold text-slate-800 dark:text-white">Flight Route Workspace Map</h3>
                  </div>
                  <span className="text-[10px] bg-sky-500/10 text-sky-500 font-bold rounded px-2 py-0.5 uppercase">Waypoint Editor</span>
                </header>
                <div className="w-full flex-1 relative min-h-[400px]">
                  <MissionMap 
                    waypoints={missionWaypoints}
                    onAddWaypoint={(lat, lng) => {
                      setMissionWaypoints([...missionWaypoints, { lat, lng, altitude: 50, action: 'Hover' }]);
                    }}
                    onUpdateWaypoint={(idx, updated) => {
                      const updatedWps = [...missionWaypoints];
                      updatedWps[idx] = { ...updatedWps[idx], ...updated };
                      setMissionWaypoints(updatedWps);
                    }}
                    onDeleteWaypoint={(idx) => {
                      setMissionWaypoints(missionWaypoints.filter((_, i) => i !== idx));
                    }}
                    onClearRoute={() => setMissionWaypoints([])}
                    geofence={geofenceCoords}
                    noFlyZones={noFlyZones}
                    satelliteMode={satelliteMode}
                    setSatelliteMode={setSatelliteMode}
                  />
                </div>
              </div>

              {/* Right Section (40%): Mission Planner Form and controls */}
              <div className="col-span-12 lg:col-span-5 h-full">
                <MissionPlannerCard 
                  drones={appState.drones}
                  waypoints={missionWaypoints}
                  onUpdateWaypoint={(idx, updated) => {
                    const updatedWps = [...missionWaypoints];
                    updatedWps[idx] = { ...updatedWps[idx], ...updated };
                    setMissionWaypoints(updatedWps);
                  }}
                  onDeleteWaypoint={(idx) => {
                    setMissionWaypoints(missionWaypoints.filter((_, i) => i !== idx));
                  }}
                  onClearRoute={() => setMissionWaypoints([])}
                  onSubmitMission={(mission) => {
                    if (mission.status === 'In Progress') {
                      // Add to flights in AppState
                      actions.addFlight({
                        drone: mission.drone,
                        pilot: 'A. Rivera',
                        destination: 'DTLA Coordinates Grid',
                        payload: mission.name,
                        status: 'In Progress'
                      });
                      
                      // Also add to upcoming/active list
                      setUpcomingMissions([
                        { name: mission.name, drone: mission.drone, time: 'In Progress (Active)', status: 'In Progress' },
                        ...upcomingMissions
                      ]);

                      // Change tab to overview to view tracking
                      setActiveTab('overview');
                    } else {
                      // Schedule
                      setUpcomingMissions([
                        { name: mission.name, drone: mission.drone, time: mission.time, status: 'Scheduled' },
                        ...upcomingMissions
                      ]);
                      // Stay or view dashboard
                      setActiveTab('overview');
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* TAB 2: LIVE CCTV MONITOR */}
          {activeTab === 'cctv' && (
            <div className="space-y-6">
              <section className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
                <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-sky-500 text-xl">smart_toy</span>
                      AI Inference — Annotated Video Stream
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Running OpenVINO SSD model on: <span className="font-bold text-sky-500">{videoPath}</span> · Pedestrian + Action detection
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-500 font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2 py-1">
                      Frame: {liveFrame}
                    </span>
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                      liveStatus === 'LIVE' ? 'bg-emerald-100 text-emerald-700' : liveStatus === 'PAUSED' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700 animate-pulse'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${liveStatus === 'LIVE' ? 'bg-emerald-500 animate-pulse' : liveStatus === 'PAUSED' ? 'bg-amber-500' : 'bg-red-500'}`}></span>
                      <span>{liveStatus}</span>
                    </span>
                  </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Local HTML5 Video Player */}
                  <div className="col-span-12 lg:col-span-8 bg-black rounded-xl overflow-hidden relative aspect-video flex items-center justify-center border border-slate-800"
                    style={{ minHeight: '300px' }}>
                    <video
                      ref={videoRef}
                      key={videoPath}
                      src={`/${videoPath}`}
                      className="w-full h-full object-contain cursor-pointer"
                      autoPlay
                      loop
                      muted
                      playsInline
                      onTimeUpdate={handleTimeUpdate}
                      onPlay={() => setLiveStatus('LIVE')}
                      onPause={() => setLiveStatus('PAUSED')}
                      onClick={handleTogglePlay}
                    />
                    {/* Overlay HUD when live */}
                    {liveStatus === 'LIVE' && (
                      <div className="absolute top-3 left-3 flex gap-2">
                        <div className="px-2 py-1 rounded text-[10px] font-bold bg-black/70 text-sky-400 border border-sky-900/50 backdrop-blur-sm">
                          {liveBackend}
                        </div>
                        <div className="px-2 py-1 rounded text-[10px] font-bold bg-black/70 text-emerald-400 border border-emerald-900/50 backdrop-blur-sm">
                          {liveFps} FPS
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sidebar controls */}
                  <div className="col-span-12 lg:col-span-4 flex flex-col justify-between gap-6">
                    {/* Control Buttons */}
                    <div className="space-y-4">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Receiver Controls</span>
                      <div className="flex gap-2">
                        <button 
                          onClick={handleTogglePlay}
                          className="flex-1 bg-primary text-white text-xs font-bold py-2.5 rounded-xl hover:bg-primary/95 flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <span className="material-symbols-outlined text-base">
                            {inferencePaused ? 'play_arrow' : 'pause'}
                          </span>
                          <span>{inferencePaused ? 'Resume Stream' : 'Pause Stream'}</span>
                        </button>

                        <button 
                          onClick={handleReset}
                          className="px-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl hover:bg-slate-50 text-slate-600 dark:text-slate-300"
                          title="Reset feed"
                        >
                          <span className="material-symbols-outlined text-base mt-1">replay</span>
                        </button>
                      </div>

                      {/* Video Source Dropdown */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-semibold block uppercase tracking-wider">📂 Video Source</label>
                        <select 
                          value={videoPath} 
                          onChange={(e) => handleSetVideo(e.target.value)}
                          className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-2 px-2 focus:ring-2 focus:ring-sky-500 focus:outline-none cursor-pointer"
                        >
                          {videoSources.map(vs => (
                            <option key={vs.value} value={vs.value}>{vs.label}</option>
                          ))}
                        </select>
                        <p className="text-[9px] text-slate-400 mt-0.5">Currently: <span className="font-bold text-sky-500">{videoPath}</span></p>
                      </div>

                      {/* Mode Select */}
                      <div className="space-y-2">
                        <label className="text-[10px] text-slate-500 font-semibold block">SSD Detection Layer Mode</label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 1, label: 'Bbox Only' },
                            { id: 2, label: 'Actions Only' },
                            { id: 3, label: 'Full SSD HUD' }
                          ].map(mode => (
                            <button
                              key={mode.id}
                              onClick={() => handleSetMode(mode.id)}
                              className={`py-2 px-1 text-center rounded-lg text-[10px] font-bold transition-all border ${
                                inferenceMode === mode.id 
                                  ? 'bg-primary text-white border-primary shadow-sm' 
                                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                              }`}
                            >
                              {mode.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Threshold Sliders */}
                      <div className="space-y-3 pt-2">
                        <div>
                          <div className="flex justify-between text-[10px] font-semibold text-slate-500 mb-1">
                            <span>Confidence Threshold</span>
                            <span>{confThreshold.toFixed(2)}</span>
                          </div>
                          <input 
                            type="range" 
                            min="0.1" 
                            max="0.9" 
                            step="0.05"
                            value={confThreshold}
                            onChange={(e) => handleSetConf(e.target.value)}
                            className="w-full accent-primary h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between text-[10px] font-semibold text-slate-500 mb-1">
                            <span>Frame Skip Rate</span>
                            <span>{frameSkip}x</span>
                          </div>
                          <select 
                            value={frameSkip}
                            onChange={(e) => handleSetSpeed(e.target.value)}
                            className="w-full text-xs rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-1.5 focus:ring-sky-500"
                          >
                            <option value={1}>1 (Process all frames)</option>
                            <option value={2}>2 (Skip every second frame)</option>
                            <option value={5}>5 (Skip 4/5 frames - High Speed)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Stats Panel */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800 text-left">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-3">Model Telemetry</span>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: 'Live FPS', val: liveFps, color: 'text-sky-500' },
                          { label: 'Pedestrians', val: livePed, color: livePed > 0 ? 'text-red-500 font-bold animate-pulse' : 'text-slate-800 dark:text-white' },
                          { label: 'Actions', val: liveAct, color: 'text-amber-500' }
                        ].map((stat, sIdx) => (
                          <div key={sIdx} className="bg-white dark:bg-[#1E293B] border border-slate-200/50 dark:border-slate-800 p-2 rounded-lg text-center shadow-xs">
                            <span className="text-[9px] text-slate-400 font-semibold block">{stat.label}</span>
                            <span className={`text-base font-extrabold mt-1 block ${stat.color}`}>{stat.val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Real-time Detections Chart */}
                <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-3 text-left">Model Detection Curves</span>
                  <div className="h-44 w-full bg-slate-50 dark:bg-slate-900/40 rounded-xl p-2 border border-slate-100 dark:border-slate-800">
                    <canvas ref={aiChartCanvasRef} />
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB: LIVE DRONE MONITORING (WebRTC via AWS KVS) */}
          {activeTab === 'live_mon' && (
            <div className="space-y-6">
              <section className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
                <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-sky-500 text-xl">sensors</span>
                      Live Drone Telemetry & Kinesis Stream
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Direct low-latency WebRTC streams from drone hardware to browser via AWS Kinesis Video Streams.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-1 rounded text-[10px] font-bold bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 uppercase tracking-wider">
                      AWS Cloud Enabled
                    </span>
                  </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* WebRTC Video Viewer */}
                  <div className="col-span-12 lg:col-span-8">
                    {selectedLiveDroneId ? (
                      <LiveStreamViewer
                        droneId={selectedLiveDroneId}
                        droneName={appState.drones.find(d => d.id === selectedLiveDroneId)?.model || selectedLiveDroneId}
                        className="w-full aspect-video shadow-lg border border-slate-200 dark:border-slate-800"
                      />
                    ) : (
                      <div className="bg-slate-900 rounded-xl overflow-hidden aspect-video flex flex-col items-center justify-center gap-3 text-center p-4 border border-slate-800" style={{ minHeight: 300 }}>
                        <span className="material-symbols-outlined text-4xl text-slate-500">videocam_off</span>
                        <p className="text-slate-400 text-sm">Select a drone to start live video monitoring</p>
                      </div>
                    )}
                  </div>

                  {/* Sidebar with Drone List */}
                  <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block text-left">Select Drone Camera Feed</span>
                    <div className="space-y-3 overflow-y-auto max-h-[400px] pr-1">
                      {appState.drones.map((drone) => {
                        const isSelected = selectedLiveDroneId === drone.id;
                        return (
                          <div
                            key={drone.id}
                            onClick={() => setSelectedLiveDroneId(drone.id)}
                            className={`p-4 rounded-xl border transition-all cursor-pointer text-left ${
                              isSelected
                                ? 'bg-sky-50/50 dark:bg-sky-950/20 border-sky-400 dark:border-sky-500/50 shadow-sm'
                                : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${
                                    drone.status === 'flying' || drone.status === 'Active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                                  }`} />
                                  {drone.model}
                                </h4>
                                <p className="text-[10px] text-slate-400 font-semibold font-mono mt-0.5">{drone.id}</p>
                              </div>
                              <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                drone.status === 'flying' || drone.status === 'Active' ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}>
                                {drone.status}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-200/50 dark:border-slate-800/50 text-[11px]">
                              <div className="flex items-center gap-1 text-slate-500">
                                <span className="material-symbols-outlined text-xs">battery_charging_full</span>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">{drone.battery}%</span>
                              </div>
                              <div className="flex items-center gap-1 text-slate-500">
                                <span className="material-symbols-outlined text-xs">signal_cellular_alt</span>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">{drone.signal || '92%'}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 3: ZONE ANALYTICS */}
          {activeTab === 'analytics' && (
            <AnalyticsCenter appState={appState} actions={actions} getApiUrl={getApiUrl} />
          )}

          {/* TAB 4: AI MODELS HUB */}
          {activeTab === 'models' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-left">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Registered Inference Models</h3>
                <p className="text-xs text-slate-500 mt-1">Okutama Action recognition engine metrics and model definitions.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                  {[
                    { name: 'Okutama SSD MobileNet V2', size: '23.8 MB', precision: 'FP16 / INT8', mAP: '84.6%', latency: '8.4 ms', backend: 'OpenVINO v2024' },
                    { name: 'YOLOv8s Crowd Security', size: '44.2 MB', precision: 'FP16', mAP: '89.2%', latency: '12.1 ms', backend: 'OpenVINO v2024' },
                    { name: 'Pose Estimation ResNet50', size: '98.0 MB', precision: 'FP32', mAP: '78.1%', latency: '24.5 ms', backend: 'OpenCV DNN' }
                  ].map((model, idx) => (
                    <div key={idx} className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50 dark:bg-slate-900/50">
                      <h4 className="font-bold text-sm text-slate-800 dark:text-white">{model.name}</h4>
                      <div className="mt-4 space-y-2 text-xs">
                        <div className="flex justify-between"><span className="text-slate-400">Model Weight:</span><span className="font-semibold">{model.size}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Precision Layer:</span><span className="font-semibold">{model.precision}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">mAP Score:</span><span className="font-semibold">{model.mAP}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Avg Latency:</span><span className="font-semibold">{model.latency}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Acceleration Backend:</span><span className="font-semibold text-sky-500">{model.backend}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SAFETY INCIDENTS */}
          {activeTab === 'safety' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-left">
                <header className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">Active Safety Incidents Log</h3>
                    <p className="text-xs text-slate-500 mt-1">Acknowledge or resolve alerts triggered by active drone sensors.</p>
                  </div>
                  <button 
                    onClick={actions.resolveAllAlerts}
                    className="bg-red-500 text-white text-xs font-bold py-2 px-4 rounded-xl hover:bg-red-600 transition-colors"
                  >
                    Resolve All Warnings
                  </button>
                </header>

                <div className="space-y-3">
                  {activeAlerts.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                      <span className="material-symbols-outlined text-4xl text-emerald-500 mb-2">task_alt</span>
                      <p className="font-bold text-slate-800 dark:text-white">No Warnings Logged</p>
                      <p className="text-xs text-slate-400 mt-0.5">Excellent! All registered hardware clusters are cleared for duty cycles.</p>
                    </div>
                  ) : (
                    activeAlerts.map((alert, idx) => (
                      <div 
                        key={`${alert.id}-${idx}`} 
                        className={`p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center gap-4 ${
                          alert.severity === 'error' ? 'border-l-4 border-l-red-500 bg-red-50/10' :
                          'border-l-4 border-l-amber-500 bg-amber-50/10'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                              alert.severity === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' :
                              'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                            }`}>{alert.severity === 'error' ? 'Critical' : 'Warning'}</span>
                            <span className="text-xs text-slate-400">{alert.time} • Unit: {alert.unit}</span>
                          </div>
                          <h4 className="font-bold text-sm text-slate-800 dark:text-white">{alert.title}</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{alert.description}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button 
                            onClick={() => setSelectedAlert(alert)}
                            className="bg-sky-500 hover:bg-sky-600 text-white text-xs py-1.5 px-3 rounded-lg font-semibold flex items-center gap-1 shadow-sm transition-colors"
                          >
                            <span className="material-symbols-outlined text-sm">visibility</span>
                            <span>View Capture</span>
                          </button>
                          <button 
                            onClick={() => actions.resolveAlert(alert.id)}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-350 text-xs py-1.5 px-3 rounded-lg font-semibold shadow-xs transition-colors"
                          >
                            Acknowledge
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: MACHINES & ASSETS */}
          {activeTab === 'machines' && (
            <div className="space-y-6">
              <header className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white">Machines & Fleet Assets</h3>
                  <p className="text-xs text-slate-500 mt-1">Manage, ground, and track hardware drone assets.</p>
                </div>
                <button 
                  onClick={() => setAddDroneOpen(true)}
                  className="bg-primary text-white text-xs font-bold py-2 px-4 rounded-xl hover:bg-primary/95 flex items-center gap-1 shadow-sm"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  <span>Register Drone Asset</span>
                </button>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredDrones.map(drone => (
                  <div key={drone.id} className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between text-left">
                    <div>
                      <div className="relative h-40 bg-slate-100 dark:bg-slate-900">
                        <img 
                          src="/drone1.jpg" 
                          className="w-full h-full object-cover" 
                          alt="Drone Asset"
                        />
                        <div className="absolute top-2 right-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                            drone.status === 'Online' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400' :
                            drone.status === 'Maintenance' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            <span className={`w-1 h-1 rounded-full ${
                              drone.status === 'Online' ? 'bg-emerald-500' :
                              drone.status === 'Maintenance' ? 'bg-amber-500' : 'bg-slate-400'
                            }`}></span>
                            <span>{drone.status}</span>
                          </span>
                        </div>
                      </div>
                      
                      <div className="p-4 space-y-3">
                        <div>
                          <div className="flex justify-between items-start">
                            <h4 className="font-bold text-sm text-slate-800 dark:text-white">{drone.id}</h4>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-mono">{drone.type}</span>
                          </div>
                          <p className="text-[10px] text-slate-400">{drone.model}</p>
                        </div>
                        
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Battery:</span>
                            <span className={`font-bold ${drone.battery < 20 ? 'text-red-500 animate-pulse' : 'text-slate-800 dark:text-white'}`}>{Math.round(drone.battery)}%</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-900 rounded-full h-1">
                            <div className={`h-1 rounded-full ${drone.battery < 20 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${drone.battery}%` }}></div>
                          </div>
                          <div className="flex justify-between pt-1">
                            <span className="text-slate-400">Payload Cap:</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{drone.payload}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Main Operator:</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{drone.operator}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 border-t border-slate-100 dark:border-slate-800/80 flex gap-2 bg-slate-50/50 dark:bg-slate-900/10">
                      <button 
                        onClick={() => handleTrackDrone(drone.id)} 
                        className="flex-1 bg-primary text-white text-[11px] font-bold py-1.5 rounded-lg hover:bg-primary/95 shadow-xs transition-colors"
                      >
                        Track
                      </button>
                      {drone.status === 'Maintenance' ? (
                        <button 
                          onClick={() => { setSelectedMaintenanceDroneId(drone.id); setActiveTab('maintenance'); }}
                          className="flex-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-[11px] font-bold py-1.5 rounded-lg hover:bg-slate-50"
                        >
                          Calibrate
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleGroundDrone(drone.id)}
                          className="flex-1 border border-red-200/50 text-red-500 hover:bg-red-500/5 text-[11px] font-bold py-1.5 rounded-lg transition-colors"
                        >
                          Ground
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: EMPLOYEE MONITOR */}
          {activeTab === 'employee' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-left">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Employee Operators Grid</h3>
                <p className="text-xs text-slate-500 mt-1">Duty state of certified drone pilots and tech handlers.</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-6">
                  {appState.users.map((user, idx) => (
                    <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl flex flex-col items-center text-center shadow-xs">
                      <div className="relative mb-4">
                        <img 
                          src="https://lh3.googleusercontent.com/aida-public/AB6AXuBijJZddpbaAwXrMcKxkk4y5a8XK3TNesNW3AycY6mN2XMSPWhi-KOtgNnDLiV7jx7kJRTX8NreKaVxQeo6CFq-GUV4ewnI2U6Vb1rZ90U3HS2UdQ6RwMHkl8qlfM-aPxnBmFCzL8Jb2Coc0PUZEMekUHPT5KHuRTpRndBVSNGdP9wR1kvr-E2RJst4YVbbbMsSyh05z_ZwxxiBlxAZOdc_RkAy5OP3aU9gZF1k_fjuiztN5z-x2YDpQGWd0_coz4R7mUbce-uDKmA" 
                          className="w-16 h-16 rounded-full border-2 border-sky-500/20 object-cover" 
                          alt="Operator avatar"
                        />
                        <span className={`w-3.5 h-3.5 rounded-full absolute bottom-0 right-0 border-2 border-white dark:border-[#1E293B] ${
                          user.status === 'Active' ? 'bg-emerald-500' :
                          user.status === 'Away' ? 'bg-amber-500' : 'bg-slate-400'
                        }`}></span>
                      </div>
                      <h4 className="font-bold text-slate-800 dark:text-white text-sm">{user.name}</h4>
                      <p className="text-xs text-slate-400 mt-1">{user.role}</p>
                      
                      <div className="mt-6 pt-3 border-t border-slate-100 dark:border-slate-800 w-full flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-semibold">Flights Overseen:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{user.flights}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: ANALYTICS & REPORTS */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-left">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">Active Flight Plan Overview</h3>
                    <p className="text-xs text-slate-500 mt-1">Full flight records list for drone surveillance operations.</p>
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Filter by pilot, drone..." 
                      value={flightSearch}
                      onChange={(e) => setFlightSearch(e.target.value)}
                      className="text-xs rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:ring-sky-500 focus:border-sky-500"
                    />
                    <button 
                      onClick={() => setFlightPlannerOpen(true)}
                      className="bg-primary text-white text-xs font-bold py-2 px-4 rounded-xl hover:bg-primary/95 flex items-center gap-1 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-sm">flight_takeoff</span>
                      <span>Dispatch Flight Plan</span>
                    </button>
                  </div>
                </header>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                        <th className="px-4 py-2.5">Flight ID</th>
                        <th className="px-4 py-2.5">Drone ID</th>
                        <th className="px-4 py-2.5">Date</th>
                        <th className="px-4 py-2.5">Duration</th>
                        <th className="px-4 py-2.5">Distance</th>
                        <th className="px-4 py-2.5">Pilot</th>
                        <th className="px-4 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {appState.flights
                        .filter(f => 
                          f.id.toLowerCase().includes(flightSearch.toLowerCase()) ||
                          f.drone.toLowerCase().includes(flightSearch.toLowerCase()) ||
                          f.pilot.toLowerCase().includes(flightSearch.toLowerCase())
                        )
                        .map(flight => (
                          <tr 
                            key={flight.id} 
                            onClick={() => handleTrackDrone(flight.drone)}
                            className="hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-3 font-bold text-slate-800 dark:text-white">{flight.id}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-semibold">{flight.drone}</td>
                            <td className="px-4 py-3 text-slate-500">{flight.date}</td>
                            <td className="px-4 py-3 text-slate-500">{flight.duration}</td>
                            <td className="px-4 py-3 text-slate-500">{flight.distance}</td>
                            <td className="px-4 py-3 text-slate-500">{flight.pilot}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                flight.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900' :
                                flight.status === 'In Progress' ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-900 animate-pulse' :
                                flight.status === 'Aborted' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900' :
                                'bg-slate-50 text-slate-700 border-slate-200'
                              }`}>{flight.status}</span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 9: ALERTS & RULES */}
          {activeTab === 'rules' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-left max-w-2xl">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Safety Intrusion & Alert Rules</h3>
                <p className="text-xs text-slate-500 mt-1">Configure threshold variables for drone alarms and auto-resolutions.</p>
                
                <div className="space-y-4 mt-6">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 block">Low Battery Alarm Threshold</label>
                    <input 
                      type="number" 
                      value={appState.settings.lowBatteryThreshold} 
                      onChange={(e) => actions.setLowBatteryThreshold(parseInt(e.target.value))}
                      className="w-full text-xs rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 block">Max Altitude Alert Limit (meters)</label>
                    <input 
                      type="number" 
                      defaultValue={120}
                      className="w-full text-xs rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 block">Safety Zone Boundary Area</label>
                    <select className="w-full text-xs rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <option>Downtown LA Restricted Grid</option>
                      <option>Full City Sphere</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 10: AUDIT & COMPLIANCE */}
          {activeTab === 'compliance' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-left">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Audit & Compliance Reports</h3>
                <p className="text-xs text-slate-500 mt-1">Verify drone fleet certification and airspace rules logging.</p>
                
                <div className="mt-6 space-y-4">
                  {[
                    { rule: 'FAA Part 107 Airspace Compliance', status: 'Compliant', date: 'June 19, 2026' },
                    { rule: 'GDPR Camera Recording Boundary Verification', status: 'Compliant', date: 'June 18, 2026' },
                    { rule: 'Model Validation check (Okutama Action SSD)', status: 'Verified', date: 'June 19, 2026' }
                  ].map((compliance, cIdx) => (
                    <div key={cIdx} className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold text-slate-800 dark:text-white">{compliance.rule}</p>
                        <p className="text-slate-400 mt-1">Last audited: {compliance.date}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 font-bold">{compliance.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 11: MAINTENANCE HUB */}
          {activeTab === 'maintenance' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
                {/* Grounded units */}
                <div className="col-span-12 lg:col-span-4 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-4">Grounded Drone Fleet</h4>
                  <div className="space-y-3">
                    {appState.drones.filter(d => d.status === 'Maintenance').length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-8">No units currently grounded in hangar.</p>
                    ) : (
                      appState.drones.filter(d => d.status === 'Maintenance').map(d => {
                        const isSelected = selectedMaintenanceDroneId === d.id || (!selectedMaintenanceDroneId && appState.drones.filter(x => x.status === 'Maintenance')[0]?.id === d.id);
                        return (
                          <div 
                            key={d.id}
                            onClick={() => setSelectedMaintenanceDroneId(d.id)}
                            className={`p-3 border rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-all flex justify-between items-center ${
                              isSelected ? 'border-primary bg-primary-container/10' : 'border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <div>
                              <p className="font-bold text-xs text-slate-800 dark:text-white">{d.id}</p>
                              <p className="text-[10px] text-slate-400">{d.model}</p>
                            </div>
                            <span className="text-[9px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-bold uppercase tracking-wider shrink-0">Grounded</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Calibration checklist */}
                <div className="col-span-12 lg:col-span-8 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  {(() => {
                    const mDrones = appState.drones.filter(d => d.status === 'Maintenance');
                    if (mDrones.length === 0) {
                      return (
                        <div className="text-center py-12 text-slate-500">
                          <span className="material-symbols-outlined text-4xl text-emerald-500 mb-2">task_alt</span>
                          <h4 className="font-bold text-slate-800 dark:text-white">Fleet Operating at Peak Health</h4>
                          <p className="text-xs text-slate-400 mt-1">Excellent! All registered hardware clusters are cleared for duty cycles.</p>
                        </div>
                      );
                    }
                    const activeMId = selectedMaintenanceDroneId || mDrones[0].id;
                    const mDrone = appState.drones.find(d => d.id === activeMId);
                    if (!mDrone) return null;

                    const isPropCalib = mDrone.health.propulsion === 100;
                    const isOptCalib = mDrone.health.optical === 100;
                    const isChassisCalib = mDrone.health.chassis === 100;

                    return (
                      <div className="space-y-4">
                        <header className="border-b border-slate-100 dark:border-slate-800 pb-3">
                          <h4 className="font-bold text-sm text-slate-800 dark:text-white">Calibrate Unit: {mDrone.id}</h4>
                          <p className="text-xs text-slate-400 mt-1">Subsystem Health indices: Propulsion: {mDrone.health.propulsion}%, Optical: {mDrone.health.optical}%, Chassis: {mDrone.health.chassis}%</p>
                        </header>

                        <div className="space-y-3">
                          {[
                            { system: 'propulsion', title: 'Replace Rotor Pin & Calibrate Propellers', desc: 'Reset thrust parameters on carbon fiber blades', isCalib: isPropCalib, icon: 'propeller' },
                            { system: 'optical', title: 'Lenses Polishing & Sensor Recalibration', desc: 'Audit stereoscopic camera arrays and IR lenses', isCalib: isOptCalib, icon: 'photo_camera' },
                            { system: 'chassis', title: 'Structural Weld Check & Battery Latches', desc: 'Check carbon composite arms and battery seating locks', isCalib: isChassisCalib, icon: 'hardware' }
                          ].map((task, tIdx) => (
                            <div key={tIdx} className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex justify-between items-center gap-4">
                              <div className="flex gap-3 items-center">
                                <span className={`material-symbols-outlined text-2xl ${task.isCalib ? 'text-emerald-500 animate-pulse' : 'text-slate-400'}`}>
                                  {task.icon}
                                </span>
                                <div>
                                  <p className="font-bold text-xs text-slate-800 dark:text-white">{task.title}</p>
                                  <p className="text-[10px] text-slate-400 mt-0.5">{task.desc}</p>
                                </div>
                              </div>
                              {task.isCalib ? (
                                <span className="material-symbols-outlined text-emerald-500 font-bold text-base">check_circle</span>
                              ) : (
                                <button 
                                  onClick={() => handleRunCalibration(mDrone.id, task.system)}
                                  className="bg-primary text-white text-[11px] font-bold py-1.5 px-3 rounded-lg hover:bg-primary/95 shadow-xs transition-all shrink-0"
                                >
                                  Run Calibration
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* TAB 12: SETTINGS & ADMIN */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-left max-w-2xl">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Settings & Admin Controls</h3>
                <p className="text-xs text-slate-500 mt-1">Configure theme preferences, simulation speed, and warning sounds.</p>
                
                <div className="mt-6 space-y-6 divide-y divide-slate-100 dark:divide-slate-800">
                  {/* Theme toggle */}
                  <div className="flex justify-between items-center py-4">
                    <div>
                      <h4 className="font-bold text-xs text-slate-800 dark:text-white">Dark Theme Interface</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">Toggle background palettes to suit operating cockpit environments.</p>
                    </div>
                    <button 
                      onClick={actions.toggleTheme}
                      className={`w-12 h-6 rounded-full relative transition-all duration-300 ${
                        appState.settings.theme === 'dark' ? 'bg-primary' : 'bg-slate-300'
                      }`}
                    >
                      <span className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all duration-300 shadow-md ${
                        appState.settings.theme === 'dark' ? 'left-6' : 'left-0.5'
                      }`}></span>
                    </button>
                  </div>

                  {/* Sound warnings */}
                  <div className="flex justify-between items-center py-4">
                    <div>
                      <h4 className="font-bold text-xs text-slate-800 dark:text-white">Sound Alerts Enabled</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">Play synthesizer warnings when critical events trigger.</p>
                    </div>
                    <button 
                      onClick={() => actions.setSoundEnabled(!appState.settings.soundsEnabled)}
                      className={`w-12 h-6 rounded-full relative transition-all duration-300 ${
                        appState.settings.soundsEnabled ? 'bg-primary' : 'bg-slate-300'
                      }`}
                    >
                      <span className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all duration-300 shadow-md ${
                        appState.settings.soundsEnabled ? 'left-6' : 'left-0.5'
                      }`}></span>
                    </button>
                  </div>

                  {/* Simulation speed */}
                  <div className="flex justify-between items-center py-4">
                    <div>
                      <h4 className="font-bold text-xs text-slate-800 dark:text-white">Simulation Core Speed</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">Clock speed coefficient for map and coordinates calculations.</p>
                    </div>
                    <select 
                      value={appState.settings.simulationSpeed} 
                      onChange={(e) => actions.setSimulationSpeed(parseFloat(e.target.value))}
                      className="text-xs rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                    >
                      <option value={1}>1.0x (Standard)</option>
                      <option value={2}>2.0x (Fast)</option>
                      <option value={5}>5.0x (Extreme)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
      </div>

      {/* ===== MODAL: REGISTER DRONE ===== */}
      {addDroneOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden text-left p-6">
            <header className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <h3 className="font-bold text-slate-800 dark:text-white">Register Fleet Drone</h3>
              <button onClick={() => setAddDroneOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </header>

            <form onSubmit={handleAddDrone} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 block">Drone Model</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Inspector Pro V3"
                  value={newDroneModel}
                  onChange={(e) => setNewDroneModel(e.target.value)}
                  className="w-full text-xs rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 block">Mission Class Type</label>
                <select 
                  value={newDroneType} 
                  onChange={(e) => setNewDroneType(e.target.value)}
                  className="w-full text-xs rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                >
                  <option value="Cargo Delivery">Cargo Delivery</option>
                  <option value="Surveillance">Surveillance</option>
                  <option value="Infrastructure Inspection">Infrastructure Inspection</option>
                  <option value="Mapping">Mapping</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 block">Camera Payload</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. FLIR Sensor Pod"
                  value={newDronePayload}
                  onChange={(e) => setNewDronePayload(e.target.value)}
                  className="w-full text-xs rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 block">Pilot In Command</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. A. Rivera"
                  value={newDroneOperator}
                  onChange={(e) => setNewDroneOperator(e.target.value)}
                  className="w-full text-xs rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                />
              </div>

              <button 
                type="submit" 
                className="w-full bg-primary text-white text-xs font-bold py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-sm mt-2"
              >
                Register Drone
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ===== MODAL: FLIGHT PLANNER ===== */}
      {flightPlannerOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden text-left p-6">
            <header className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <h3 className="font-bold text-slate-800 dark:text-white">Dispatch Flight Plan</h3>
              <button onClick={() => setFlightPlannerOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </header>

            <form onSubmit={handleDispatchFlight} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 block">Select Available Drone</label>
                <select 
                  required
                  value={newFlightDrone}
                  onChange={(e) => setNewFlightDrone(e.target.value)}
                  className="w-full text-xs rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                >
                  <option value="">-- Choose Drone --</option>
                  {appState.drones.filter(d => d.status !== 'Maintenance').map(d => (
                    <option key={d.id} value={d.id}>{d.id} ({d.model}) - {Math.round(d.battery)}% batt</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 block">Operator Pilot</label>
                <input 
                  type="text" 
                  required
                  placeholder="Operator name"
                  value={newFlightPilot}
                  onChange={(e) => setNewFlightPilot(e.target.value)}
                  className="w-full text-xs rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 block">Mission Destination</label>
                <select 
                  value={newFlightDest} 
                  onChange={(e) => setNewFlightDest(e.target.value)}
                  className="w-full text-xs rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                >
                  <option value="Westside Hospital Pad">Westside Hospital Pad</option>
                  <option value="Storage Rack B">Storage Hangar Sector Alpha</option>
                  <option value="Charging Pad Alpha">Charging Pad Alpha</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 block">Payload Contents</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Medical package"
                  value={newFlightPayload}
                  onChange={(e) => setNewFlightPayload(e.target.value)}
                  className="w-full text-xs rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                />
              </div>

              <button 
                type="submit" 
                className="w-full bg-primary text-white text-xs font-bold py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-sm mt-2"
              >
                Dispatch Flight Mission
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ===== MODAL: ALERT EVIDENCE VIEW ===== */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl w-full max-w-xl min-w-[280px] sm:min-w-[480px] md:min-w-[576px] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden text-left p-6">
            <header className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-red-500 animate-pulse">videocam</span>
                <h3 className="font-extrabold text-slate-800 dark:text-white">Incident Capture Evidence</h3>
              </div>
              <button 
                onClick={() => setSelectedAlert(null)} 
                className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-200"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </header>

            <div className="space-y-4">
              {/* Telemetry info */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-slate-400 font-semibold uppercase text-[9px] block">Alert Event</span>
                  <span className="font-bold text-slate-800 dark:text-white">{selectedAlert.title}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold uppercase text-[9px] block">Trigger Unit</span>
                  <span className="font-bold text-slate-800 dark:text-white">{selectedAlert.unit}</span>
                </div>
                <div className="mt-1">
                  <span className="text-slate-400 font-semibold uppercase text-[9px] block">Time Logged</span>
                  <span className="font-bold text-slate-800 dark:text-white">{selectedAlert.time}</span>
                </div>
                <div className="mt-1">
                  <span className="text-slate-400 font-semibold uppercase text-[9px] block">Status</span>
                  <span className={`font-bold ${selectedAlert.resolved ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {selectedAlert.resolved ? 'Acknowledged' : 'Active Warning'}
                  </span>
                </div>
              </div>

              {/* Video Player Box */}
              <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black aspect-video flex items-center justify-center group">
                <video
                  key={selectedAlert.id} // force reload on alert change
                  src={selectedAlert.videoUrl || "/cam2.mp4#t=10,15"}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                
                {/* HUD Overlay Scan line & text */}
                <div className="absolute inset-0 pointer-events-none border-2 border-red-500/30 rounded-xl flex flex-col justify-between p-4 font-mono text-[10px] text-red-500/90 tracking-wider">
                  <div className="flex justify-between items-start">
                    <div>
                      <div>SYS: Z-DRONE INF_DET</div>
                      <div>UNIT: {selectedAlert.unit}</div>
                      <div>LOC: SECTOR ALPHA</div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 justify-end font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-655 animate-ping"></span>
                        <span>PLAYING CLIP</span>
                      </div>
                      <div>5.0s LOOP</div>
                    </div>
                  </div>
                  
                  {/* Bounding box mock scan HUD */}
                  <div className="absolute inset-1/4 border border-dashed border-red-500/40 pointer-events-none flex items-center justify-center">
                    <span className="bg-red-600 text-white text-[8px] px-1 font-sans rounded-xs absolute top-0 left-0 uppercase font-bold tracking-tight">PEDESTRIAN</span>
                  </div>

                  <div className="flex justify-between items-end">
                    <div>WATERMARK: {selectedAlert.id}</div>
                    <div>FPS: 30.1 // OpenVINO</div>
                  </div>
                </div>

                {/* Scanline CRT style effect */}
                <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%] opacity-40"></div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed italic">
                "{selectedAlert.description}"
              </p>
            </div>

            <footer className="flex justify-end gap-2.5 mt-6 border-t border-slate-100 dark:border-slate-800 pt-4">
              <button
                onClick={() => setSelectedAlert(null)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold py-2 px-4 rounded-xl shadow-xs"
              >
                Close
              </button>
              {!selectedAlert.resolved && (
                <button
                  onClick={() => {
                    actions.resolveAlert(selectedAlert.id);
                    setSelectedAlert({ ...selectedAlert, resolved: true });
                  }}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-colors"
                >
                  Acknowledge Incident
                </button>
              )}
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

export default Dashboard;
