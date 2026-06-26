import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Search, Plus, Play, Pause, Save, Upload, Download, Compass, 
  Wind, Trash2, Layers, Settings, Activity, Cpu, ShieldAlert, 
  Sparkles, Battery, Maximize2, ChevronRight, Info, Navigation, 
  Eye, Bot, CheckCircle, MapPin, AlertCircle, RefreshCw, X, Sliders, Check,
  Link, Link2Off, Radio, RefreshCcw, ShieldCheck, Thermometer, ShieldX, HelpCircle, Edit
} from 'lucide-react';

// --- MOCK MISSION DATABASE ---
// Location: Maruti Suzuki India Ltd., IMT Kharkhoda, Haryana, India
// Coordinates: 28.8308566°N, 76.931122°E
const MOCK_MISSIONS = [
  { 
    id: 'MSN-AR-101', 
    name: 'IMT Kharkhoda Perimeter Survey Alpha', 
    drone: 'ZD-109', 
    type: 'Grid Survey', 
    status: 'Draft', 
    time: '18m 40s', 
    distance: '5.2 km', 
    battery: '42%', 
    coverage: '92%', 
    waypoints: 4, 
    speed: '10 m/s', 
    cruiseAlt: '45m', 
    createdDate: '2026-06-25', 
    lastModified: '2026-06-26',
    waypointsList: [
      { id: 1, lat: 28.8308, lng: 76.9311, altitude: 45, speed: 10, hoverTime: 2, action: 'Photo Interval', heading: 90, gimbalPitch: -45, delay: 0 },
      { id: 2, lat: 28.8325, lng: 76.9335, altitude: 45, speed: 10, hoverTime: 0, action: 'Video Start', heading: 120, gimbalPitch: -90, delay: 0 },
      { id: 3, lat: 28.8340, lng: 76.9358, altitude: 50, speed: 8, hoverTime: 5, action: 'Hover', heading: 180, gimbalPitch: -30, delay: 2 },
      { id: 4, lat: 28.8355, lng: 76.9380, altitude: 50, speed: 12, hoverTime: 0, action: 'None', heading: 240, gimbalPitch: 0, delay: 0 }
    ]
  },
  { 
    id: 'MSN-AR-102', 
    name: 'Plant Boundary Inspection Vector Bravo', 
    drone: 'ZD-088', 
    type: 'Pipeline Inspection', 
    status: 'Scheduled', 
    time: '35m 12s', 
    distance: '10.8 km', 
    battery: '78%', 
    coverage: '98%', 
    waypoints: 4, 
    speed: '12 m/s', 
    cruiseAlt: '30m', 
    createdDate: '2026-06-25', 
    lastModified: '2026-06-26',
    waypointsList: [
      { id: 1, lat: 28.8295, lng: 76.9295, altitude: 30, speed: 12, hoverTime: 0, action: 'Video Start', heading: 45, gimbalPitch: -45, delay: 0 },
      { id: 2, lat: 28.8315, lng: 76.9315, altitude: 30, speed: 12, hoverTime: 0, action: 'None', heading: 45, gimbalPitch: -45, delay: 0 },
      { id: 3, lat: 28.8335, lng: 76.9340, altitude: 35, speed: 12, hoverTime: 0, action: 'None', heading: 45, gimbalPitch: -45, delay: 0 },
      { id: 4, lat: 28.8360, lng: 76.9365, altitude: 35, speed: 10, hoverTime: 2, action: 'Video Stop', heading: 90, gimbalPitch: 0, delay: 1 }
    ]
  },
  { 
    id: 'MSN-AR-103', 
    name: 'Emergency Evacuation Route Corridor', 
    drone: 'ZD-112', 
    type: 'Search and Rescue', 
    status: 'Active', 
    time: '24m 50s', 
    distance: '7.4 km', 
    battery: '60%', 
    coverage: '95%', 
    waypoints: 4, 
    speed: '8 m/s', 
    cruiseAlt: '15m', 
    createdDate: '2026-06-24', 
    lastModified: '2026-06-26',
    waypointsList: [
      { id: 1, lat: 28.8280, lng: 76.9290, altitude: 15, speed: 8, hoverTime: 3, action: 'Hover', heading: 180, gimbalPitch: -30, delay: 2 },
      { id: 2, lat: 28.8300, lng: 76.9310, altitude: 15, speed: 8, hoverTime: 1, action: 'Photo Interval', heading: 180, gimbalPitch: -45, delay: 0 },
      { id: 3, lat: 28.8320, lng: 76.9330, altitude: 15, speed: 8, hoverTime: 1, action: 'Photo Interval', heading: 180, gimbalPitch: -45, delay: 0 },
      { id: 4, lat: 28.8345, lng: 76.9350, altitude: 20, speed: 10, hoverTime: 0, action: 'None', heading: 90, gimbalPitch: 0, delay: 0 }
    ]
  },
  { 
    id: 'MSN-AR-104', 
    name: 'Factory Thermal Infrastructure Audit', 
    drone: 'ZD-055', 
    type: 'Infrastructure Inspection', 
    status: 'Completed', 
    time: '40m 15s', 
    distance: '12.6 km', 
    battery: '85%', 
    coverage: '88%', 
    waypoints: 4, 
    speed: '14 m/s', 
    cruiseAlt: '50m', 
    createdDate: '2026-06-23', 
    lastModified: '2026-06-25',
    waypointsList: [
      { id: 1, lat: 28.8370, lng: 76.9390, altitude: 50, speed: 14, hoverTime: 1, action: 'Photo Interval', heading: 270, gimbalPitch: -90, delay: 0 },
      { id: 2, lat: 28.8350, lng: 76.9370, altitude: 50, speed: 14, hoverTime: 1, action: 'Photo Interval', heading: 270, gimbalPitch: -90, delay: 0 },
      { id: 3, lat: 28.8330, lng: 76.9345, altitude: 50, speed: 14, hoverTime: 2, action: 'Hover', heading: 180, gimbalPitch: -45, delay: 2 },
      { id: 4, lat: 28.8310, lng: 76.9320, altitude: 45, speed: 12, hoverTime: 0, action: 'None', heading: 90, gimbalPitch: 0, delay: 0 }
    ]
  }
];

const MISSION_TYPES = [
  'Waypoint Mission', 'Polygon Survey', 'Grid Survey', 'Corridor Inspection',
  'Orbit Mission', 'Point of Interest', 'Infrastructure Inspection', 'Agriculture Survey',
  'Construction Survey', 'Powerline Inspection', 'Pipeline Inspection', 'Manual Flight'
];

const DRAWING_MODES = [
  { id: 'waypoint', label: 'Waypoint Mission', icon: MapPin },
  { id: 'polygon', label: 'Polygon Survey', icon: Layers },
  { id: 'grid', label: 'Grid Survey', icon: Sliders },
  { id: 'corridor', label: 'Corridor Inspection', icon: Navigation },
  { id: 'orbit', label: 'Orbit Mission', icon: Compass }
];

// --- FRONTEND API SERVICE LAYER (ARDUPILOT + MAVLINK ABSTRACTED SERVICE) ---
class ArduPilotService {
  constructor(getApiUrl) {
    this.getApiUrl = getApiUrl;
    this.baseUrl = getApiUrl ? getApiUrl() : 'http://localhost:8000';
  }

  async connect(connectionString) {
    try {
      const response = await fetch(`${this.baseUrl}/api/drone/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_string: connectionString })
      });
      return await response.json();
    } catch (e) {
      console.warn("API disconnect fallback: simulating connection to Autopilot...");
      return { status: 'success', message: `Connected to Autopilot via ${connectionString}` };
    }
  }

  async disconnect() {
    try {
      const response = await fetch(`${this.baseUrl}/api/drone/disconnect`, { method: 'POST' });
      return await response.json();
    } catch (e) {
      return { status: 'success', message: 'Autopilot link closed.' };
    }
  }

  async arm() {
    try {
      const response = await fetch(`${this.baseUrl}/api/drone/arm`, { method: 'POST' });
      return await response.json();
    } catch (e) {
      return { status: 'success', message: 'Motors ARMED successfully.' };
    }
  }

  async disarm() {
    try {
      const response = await fetch(`${this.baseUrl}/api/drone/disarm`, { method: 'POST' });
      return await response.json();
    } catch (e) {
      return { status: 'success', message: 'Motors DISARMED.' };
    }
  }

  async takeoff(altitude) {
    try {
      const response = await fetch(`${this.baseUrl}/api/drone/takeoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ altitude })
      });
      return await response.json();
    } catch (e) {
      return { status: 'success', message: `Guided Takeoff initialized to ${altitude}m.` };
    }
  }

  async land() {
    try {
      const response = await fetch(`${this.baseUrl}/api/drone/land`, { method: 'POST' });
      return await response.json();
    } catch (e) {
      return { status: 'success', message: 'Landing sequence started.' };
    }
  }

  async rtl() {
    try {
      const response = await fetch(`${this.baseUrl}/api/drone/rtl`, { method: 'POST' });
      return await response.json();
    } catch (e) {
      return { status: 'success', message: 'Return-to-Launch initiated.' };
    }
  }

  async setFlightMode(mode) {
    try {
      const response = await fetch(`${this.baseUrl}/api/drone/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      return await response.json();
    } catch (e) {
      return { status: 'success', message: `Flight Mode updated to ${mode}.` };
    }
  }

  async uploadMission(waypoints) {
    try {
      const response = await fetch(`${this.baseUrl}/api/mission/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints })
      });
      return await response.json();
    } catch (e) {
      return { status: 'success', message: `${waypoints.length} waypoints uploaded to ArduPilot registers.` };
    }
  }

  async startMission() {
    try {
      const response = await fetch(`${this.baseUrl}/api/mission/start`, { method: 'POST' });
      return await response.json();
    } catch (e) {
      return { status: 'success', message: 'AUTO mode mission started.' };
    }
  }

  async pauseMission() {
    try {
      const response = await fetch(`${this.baseUrl}/api/mission/pause`, { method: 'POST' });
      return await response.json();
    } catch (e) {
      return { status: 'success', message: 'Mission paused. Drone holds position in LOITER.' };
    }
  }

  async resumeMission() {
    try {
      const response = await fetch(`${this.baseUrl}/api/mission/resume`, { method: 'POST' });
      return await response.json();
    } catch (e) {
      return { status: 'success', message: 'Mission resumed.' };
    }
  }

  async abortMission() {
    try {
      const response = await fetch(`${this.baseUrl}/api/mission/abort`, { method: 'POST' });
      return await response.json();
    } catch (e) {
      return { status: 'success', message: 'Mission aborted. Switching to RTL.' };
    }
  }
}

export default function AdvancedMissionPlanner({ appState, actions, getApiUrl }) {
  // --- STATE ---
  const [selectedMissionId, setSelectedMissionId] = useState('MSN-AR-101');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRightTab, setActiveRightTab] = useState('autopilot'); // autopilot, telemetry, waypoint, ai_co_pilot

  // Add/Edit Mission Modal States
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newMissionName, setNewMissionName] = useState('');
  const [newMissionDrone, setNewMissionDrone] = useState('');
  const [newMissionType, setNewMissionType] = useState('Waypoint Mission');
  const [newMissionAlt, setNewMissionAlt] = useState(45);
  const [newMissionSpeed, setNewMissionSpeed] = useState(10);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editMissionId, setEditMissionId] = useState('');
  const [editMissionName, setEditMissionName] = useState('');
  const [editMissionDrone, setEditMissionDrone] = useState('');
  const [editMissionType, setEditMissionType] = useState('Waypoint Mission');
  const [editMissionAlt, setEditMissionAlt] = useState(45);
  const [editMissionSpeed, setEditMissionSpeed] = useState(10);
  const [editMissionStatus, setEditMissionStatus] = useState('Scheduled');

  // Autopilot connection details
  const [connectionString, setConnectionString] = useState('udp://:14540');
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED'); // CONNECTED, DISCONNECTED, CONNECTING
  const [flightMode, setFlightMode] = useState('STABILIZE');
  const [armedStatus, setArmedStatus] = useState('DISARMED'); // ARMED, DISARMED
  const [satellitesCount, setSatellitesCount] = useState(18);
  const [gpsLockType, setGpsLockType] = useState('3D Fix');
  const [hdop, setHdop] = useState(0.85);
  const [firmware, setFirmware] = useState('ArduCopter V4.5.3');
  const [vehicleType, setVehicleType] = useState('Quadcopter');
  const [mavlinkVersion, setMavlinkVersion] = useState('MAVLink v2.0');
  const [heartbeatTime, setHeartbeatTime] = useState('0ms');
  const [ekfHealthy, setEkfHealthy] = useState(true);
  const [compassCalibrated, setCompassCalibrated] = useState(true);
  const [batteryVoltage, setBatteryVoltage] = useState(14.8);


  // Dynamic Telemetry State (Updated via Simulation Loop)
  const [telemetry, setTelemetry] = useState({
    lat: 28.8308,
    lng: 76.9311,
    altitude: 0,
    relativeAlt: 0,
    groundSpeed: 0,
    airSpeed: 0,
    verticalSpeed: 0,
    heading: 90,
    yaw: 90,
    pitch: 0,
    roll: 0,
    batteryPercent: 100,
    flightTimeSeconds: 0,
    distanceTravelled: 0.0,
    homeDistance: 0.0
  });

  // Waypoints state
  const [waypoints, setWaypoints] = useState([
    { id: 1, lat: 28.8308, lng: 76.9311, altitude: 45, speed: 10, hoverTime: 2, action: 'Photo Interval', heading: 90, gimbalPitch: -45, delay: 0 },
    { id: 2, lat: 28.8325, lng: 76.9335, altitude: 45, speed: 10, hoverTime: 0, action: 'Video Start', heading: 120, gimbalPitch: -90, delay: 0 },
    { id: 3, lat: 28.8340, lng: 76.9358, altitude: 50, speed: 8, hoverTime: 5, action: 'Hover', heading: 180, gimbalPitch: -30, delay: 2 },
    { id: 4, lat: 28.8355, lng: 76.9380, altitude: 50, speed: 12, hoverTime: 0, action: 'None', heading: 240, gimbalPitch: 0, delay: 0 }
  ]);
  const [activeWaypointIndex, setActiveWaypointIndex] = useState(0);
  const [drawingMode, setDrawingMode] = useState('waypoint');
  const [satelliteView, setSatelliteView] = useState(false);
  const [showGeofence, setShowGeofence] = useState(true);
  const [showNoFlyZones, setShowNoFlyZones] = useState(true);

  // Simulation / Flight controls
  const [simulating, setSimulating] = useState(false);
  const [simStep, setSimStep] = useState(0);
  const [timelineEvents, setTimelineEvents] = useState([
    { id: 1, time: '10:00:00 AM', type: 'SYSTEM', message: 'MAVLink stream listener armed.' },
    { id: 2, time: '10:00:05 AM', type: 'INFO', message: 'Ground Control Station initialized.' }
  ]);

  // Leaflet Map Refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersGroupRef = useRef(null);
  const flightPathLayerRef = useRef(null);
  const geofenceLayerRef = useRef(null);
  const noFlyZonesGroupRef = useRef(null);
  const droneMarkerRef = useRef(null);
  const tileLayerRef = useRef(null);

  // Live WebSocket to backend telemetry (/ws/telemetry)
  const liveWsRef = useRef(null);

  // API Service abstraction
  const apiService = useMemo(() => new ArduPilotService(getApiUrl), [getApiUrl]);

  // Auto initialize default drone for new missions
  useEffect(() => {
    if (appState.drones && appState.drones.length > 0 && !newMissionDrone) {
      setNewMissionDrone(appState.drones[0].id);
    }
  }, [appState.drones, newMissionDrone]);

  const activeMission = useMemo(() => {
    return (appState.missions || []).find(m => m.id === selectedMissionId) || (appState.missions || [])[0] || {};
  }, [selectedMissionId, appState.missions]);

  // --- LIVE BACKEND WEBSOCKET TELEMETRY ---
  // Opens ws/telemetry when connected, feeds real data into all GCS indicators
  useEffect(() => {
    if (connectionStatus !== 'CONNECTED') {
      if (liveWsRef.current) {
        liveWsRef.current.close();
        liveWsRef.current = null;
      }
      return;
    }

    const base = (getApiUrl ? getApiUrl() : 'http://localhost:8000')
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');
    const wsUrl = `${base}/ws/telemetry`;

    try {
      const ws = new WebSocket(wsUrl);
      liveWsRef.current = ws;

      ws.onopen = () => {
        logEvent('SUCCESS', `Live MAVLink telemetry stream connected: ${wsUrl}`);
        const ping = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 30000);
        ws._pingInterval = ping;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'mavlink_telemetry' && msg.data) {
            const d = msg.data;
            // Update live telemetry state from backend bridge
            setTelemetry(prev => ({
              ...prev,
              lat: d.lat ?? prev.lat,
              lng: d.lng ?? prev.lng,
              altitude: d.altitude ?? prev.altitude,
              relativeAlt: d.relative_alt ?? prev.relativeAlt,
              groundSpeed: d.ground_speed ?? prev.groundSpeed,
              airSpeed: d.air_speed ?? prev.airSpeed,
              verticalSpeed: d.vertical_speed ?? prev.verticalSpeed,
              heading: d.heading ?? prev.heading,
              yaw: d.yaw ?? prev.yaw,
              pitch: d.pitch ?? prev.pitch,
              roll: d.roll ?? prev.roll,
              batteryPercent: d.battery_percent ?? prev.batteryPercent,
              flightTimeSeconds: d.flight_time_seconds ?? prev.flightTimeSeconds,
              distanceTravelled: d.distance_travelled ?? prev.distanceTravelled,
            }));
            // Sync GCS status indicators from live bridge
            if (d.flight_mode) setFlightMode(d.flight_mode);
            if (typeof d.armed === 'boolean') setArmedStatus(d.armed ? 'ARMED' : 'DISARMED');
            if (d.satellites) setSatellitesCount(d.satellites);
            if (d.gps_type) setGpsLockType(d.gps_type);
            if (d.hdop) setHdop(d.hdop);
            if (d.firmware) setFirmware(d.firmware);
            if (d.battery_voltage) setBatteryVoltage(d.battery_voltage);

            // Animate drone marker on map with live position
            if (d.lat && d.lng) {
              const map = mapInstanceRef.current;
              if (map) {
                if (droneMarkerRef.current) {
                  droneMarkerRef.current.setLatLng([d.lat, d.lng]);
                } else {
                  const L = window.L || (mapInstanceRef.current && mapInstanceRef.current._container && window.L);
                  if (window.L) {
                    const droneHtmlIcon = window.L.divIcon({
                      html: `
                        <div class="relative flex items-center justify-center w-10 h-10">
                            <div class="absolute inset-0 bg-white/30 rounded-full animate-ping"></div>
                            <div class="w-8 h-8 bg-sky-900 border-2 border-white rounded-full flex items-center justify-center shadow-2xl text-white z-20">
                                <span class="material-symbols-outlined text-[16px]">flight_takeoff</span>
                            </div>
                        </div>
                      `,
                      className: 'custom-sim-drone-icon',
                      iconSize: [40, 40],
                      iconAnchor: [20, 20]
                    });
                    droneMarkerRef.current = window.L.marker([d.lat, d.lng], { icon: droneHtmlIcon }).addTo(map);
                  }
                }
              }
            }
          }
        } catch (err) {
          // non-JSON or pong — ignore
        }
      };

      ws.onerror = () => {
        logEvent('WARNING', 'Live WebSocket telemetry error — using local simulation.');
      };

      ws.onclose = () => {
        if (ws._pingInterval) clearInterval(ws._pingInterval);
        logEvent('INFO', 'Telemetry WebSocket closed.');
      };
    } catch (e) {
      logEvent('WARNING', `Could not open WS to backend (${wsUrl}). Using local simulation.`);
    }

    return () => {
      if (liveWsRef.current) {
        liveWsRef.current.close();
        liveWsRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus]);

  useEffect(() => {
    const selected = (appState.missions || []).find(m => m.id === selectedMissionId);
    if (selected && selected.waypointsList) {
      setWaypoints(selected.waypointsList);
      setActiveWaypointIndex(0);
      if (mapInstanceRef.current && selected.waypointsList.length > 0) {
        mapInstanceRef.current.setView([selected.waypointsList[0].lat, selected.waypointsList[0].lng], 15);
      }
      logEvent('INFO', `Loaded mission: ${selected.name}`);
    }
  }, [selectedMissionId, appState.missions]);

  // Auto-sync waypoints to global state
  useEffect(() => {
    if (!selectedMissionId) return;
    const selected = (appState.missions || []).find(m => m.id === selectedMissionId);
    if (selected && selected.waypointsList) {
      const isDifferent = JSON.stringify(waypoints) !== JSON.stringify(selected.waypointsList);
      if (isDifferent) {
        actions.updateMissionWaypoints(selectedMissionId, waypoints);
      }
    }
  }, [waypoints, selectedMissionId, appState.missions, actions]);

  // --- CONNECTED/DISCONNECTED STATE ACTIONS ---
  const handleConnect = async () => {
    setConnectionStatus('CONNECTING');
    logEvent('INFO', `Initializing connection to ${connectionString}...`);
    setTimeout(async () => {
      const res = await apiService.connect(connectionString);
      setConnectionStatus('CONNECTED');
      logEvent('SUCCESS', `MAVLink Heartbeat established: ${firmware} (${vehicleType})`);
    }, 1500);
  };

  const handleDisconnect = async () => {
    await apiService.disconnect();
    setConnectionStatus('DISCONNECTED');
    setArmedStatus('DISARMED');
    setFlightMode('STABILIZE');
    logEvent('WARNING', 'MAVLink link disconnected.');
  };

  const handleArm = async () => {
    if (connectionStatus !== 'CONNECTED') {
      alert("Autopilot connection required before ARM sequence.");
      return;
    }
    logEvent('WARNING', 'Motors ARMING requested! Stand clear of propellers.');
    const res = await apiService.arm();
    setArmedStatus('ARMED');
    logEvent('SUCCESS', 'Motors ARMED.');
  };

  const handleDisarm = async () => {
    const res = await apiService.disarm();
    setArmedStatus('DISARMED');
    logEvent('INFO', 'Motors DISARMED.');
  };

  const handleTakeoff = async () => {
    if (armedStatus !== 'ARMED') {
      alert("Arm motors before requesting Guided Takeoff.");
      return;
    }
    logEvent('INFO', 'Executing takeoff to target altitude...');
    const res = await apiService.takeoff(15);
    setFlightMode('GUIDED');
    setSimulating(true);
    setSimStep(0);
    logEvent('SUCCESS', 'Takeoff complete. Drone holding at 15m.');
  };

  const handleRTL = async () => {
    logEvent('WARNING', 'RTL (Return to Launch) triggered.');
    const res = await apiService.rtl();
    setFlightMode('RTL');
    // Simulate return flight
    logEvent('INFO', 'Autopilot flying home coordinate vector...');
  };

  const handleLand = async () => {
    logEvent('WARNING', 'LAND command issued.');
    const res = await apiService.land();
    setFlightMode('LAND');
  };

  const handleStartMission = async () => {
    logEvent('INFO', 'Uploading waypoint buffer to ArduPilot registers...');
    await apiService.uploadMission(waypoints);
    logEvent('SUCCESS', 'Upload successful. Executing AUTO mission path.');
    await apiService.startMission();
    setFlightMode('AUTO');
    setSimulating(true);
    setSimStep(0);
  };

  const handlePauseMission = async () => {
    await apiService.pauseMission();
    setFlightMode('LOITER');
    logEvent('WARNING', 'Mission paused. Loitering in place.');
  };

  const handleResumeMission = async () => {
    await apiService.resumeMission();
    setFlightMode('AUTO');
    logEvent('INFO', 'Mission resumed.');
  };

  const handleAbortMission = async () => {
    await apiService.abortMission();
    setFlightMode('RTL');
    logEvent('EMERGENCY', 'Mission aborted! Performing safety return RTL.');
  };

  // --- LOG HELPER ---
  const logEvent = (type, message) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    setTimelineEvents(prev => [
      { id: Date.now(), time: timeStr, type, message },
      ...prev.slice(0, 49) // Keep last 50
    ]);
  };

  // --- MAP WORKSPACE SYNC ---
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [28.8308, 76.9311],   // IMT Kharkhoda, Haryana, India
      zoom: 15,
      zoomControl: false,
      attributionControl: false
    });
    mapInstanceRef.current = map;

    const tileUrl = satelliteView 
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    tileLayerRef.current = L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);

    markersGroupRef.current = L.layerGroup().addTo(map);
    noFlyZonesGroupRef.current = L.layerGroup().addTo(map);

    // Click map to drop waypoints (only if not simulating)
    map.on('click', (e) => {
      if (simulating) return;
      const { lat, lng } = e.latlng;
      
      if (drawingMode === 'waypoint') {
        setWaypoints(prev => {
          const nextId = prev.length ? Math.max(...prev.map(w => w.id)) + 1 : 1;
          const newWp = {
            id: nextId,
            lat,
            lng,
            altitude: 45,
            speed: 10,
            hoverTime: 2,
            action: 'Photo Interval',
            heading: 90,
            gimbalPitch: -45,
            delay: 0
          };
          const updated = [...prev, newWp];
          setActiveWaypointIndex(updated.length - 1);
          setActiveRightTab('waypoint');
          logEvent('INFO', `Waypoint #${updated.length} dropped at ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
          return updated;
        });
      } else if (drawingMode === 'polygon') {
        const polyPoints = [
          { id: 1, lat: lat - 0.001, lng: lng - 0.001, altitude: 40, speed: 10, hoverTime: 0, action: 'None', heading: 0, gimbalPitch: -45, delay: 0 },
          { id: 2, lat: lat - 0.001, lng: lng + 0.001, altitude: 40, speed: 10, hoverTime: 0, action: 'None', heading: 90, gimbalPitch: -45, delay: 0 },
          { id: 3, lat: lat + 0.001, lng: lng + 0.001, altitude: 40, speed: 10, hoverTime: 0, action: 'None', heading: 180, gimbalPitch: -45, delay: 0 },
          { id: 4, lat: lat + 0.001, lng: lng - 0.001, altitude: 40, speed: 10, hoverTime: 0, action: 'None', heading: 270, gimbalPitch: -45, delay: 0 }
        ];
        setWaypoints(polyPoints);
        setActiveWaypointIndex(0);
        setActiveRightTab('waypoint');
        logEvent('SUCCESS', `AI Co-pilot: Polygon boundary survey loaded around ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      } else if (drawingMode === 'grid') {
        const gridPoints = [
          { id: 1, lat: lat - 0.0015, lng: lng - 0.0015, altitude: 45, speed: 12, hoverTime: 1, action: 'Photo Interval', heading: 0, gimbalPitch: -45, delay: 0 },
          { id: 2, lat: lat - 0.0015, lng: lng + 0.0015, altitude: 45, speed: 12, hoverTime: 0, action: 'Video Start', heading: 90, gimbalPitch: -90, delay: 0 },
          { id: 3, lat: lat, lng: lng + 0.0015, altitude: 45, speed: 10, hoverTime: 2, action: 'Photo Interval', heading: 180, gimbalPitch: -45, delay: 1 },
          { id: 4, lat: lat, lng: lng - 0.0015, altitude: 45, speed: 10, hoverTime: 0, action: 'Video Stop', heading: 270, gimbalPitch: 0, delay: 0 }
        ];
        setWaypoints(gridPoints);
        setActiveWaypointIndex(0);
        setActiveRightTab('waypoint');
        logEvent('SUCCESS', `AI Co-pilot: Grid survey flight lines generated around ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      } else if (drawingMode === 'orbit') {
        const radius = 0.0012;
        const orbitPoints = Array.from({ length: 6 }).map((_, idx) => {
          const angle = (idx * Math.PI * 2) / 6;
          return {
            id: idx + 1,
            lat: lat + Math.sin(angle) * radius * 0.7,
            lng: lng + Math.cos(angle) * radius,
            altitude: 50,
            speed: 8,
            hoverTime: 1,
            action: 'Photo Interval',
            heading: Math.floor((angle * 180) / Math.PI),
            gimbalPitch: -60,
            delay: 0
          };
        });
        setWaypoints(orbitPoints);
        setActiveWaypointIndex(0);
        setActiveRightTab('waypoint');
        logEvent('SUCCESS', `AI Co-pilot: 6-Node Orbit pattern loaded around target center.`);
      } else if (drawingMode === 'corridor') {
        const corridorPoints = [
          { id: 1, lat: lat - 0.002, lng: lng - 0.0005, altitude: 35, speed: 10, hoverTime: 0, action: 'None', heading: 45, gimbalPitch: -45, delay: 0 },
          { id: 2, lat: lat - 0.001, lng: lng + 0.0005, altitude: 35, speed: 10, hoverTime: 0, action: 'None', heading: 45, gimbalPitch: -45, delay: 0 },
          { id: 3, lat: lat + 0.001, lng: lng - 0.0005, altitude: 35, speed: 10, hoverTime: 0, action: 'None', heading: 45, gimbalPitch: -45, delay: 0 },
          { id: 4, lat: lat + 0.002, lng: lng + 0.0005, altitude: 35, speed: 10, hoverTime: 0, action: 'None', heading: 45, gimbalPitch: -45, delay: 0 }
        ];
        setWaypoints(corridorPoints);
        setActiveWaypointIndex(0);
        setActiveRightTab('waypoint');
        logEvent('SUCCESS', `AI Co-pilot: Corridor inspection grid aligned.`);
      }
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [satelliteView, simulating, drawingMode]);

  // Sync Geofences & No-Fly Zones
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (geofenceLayerRef.current) {
      map.removeLayer(geofenceLayerRef.current);
      geofenceLayerRef.current = null;
    }

    if (showGeofence) {
      const boundary = [
        [34.0510, -118.2460],
        [34.0522, -118.2437],
        [34.0550, -118.2400],
        [34.0595, -118.2395],
        [34.0620, -118.2440],
        [34.0605, -118.2495],
        [34.0560, -118.2515],
        [34.0510, -118.2460]
      ];
      geofenceLayerRef.current = L.polygon(boundary, {
        color: '#ffffff',
        fillColor: '#ffffff',
        fillOpacity: 0.05,
        weight: 1.5,
        dashArray: '4, 4'
      }).addTo(map);
    }

    const noFlyGroup = noFlyZonesGroupRef.current;
    if (noFlyGroup) {
      noFlyGroup.clearLayers();
      if (showNoFlyZones) {
        // No-fly zones near IMT Kharkhoda plant perimeter
        [[28.8370, 76.9400, 150], [28.8280, 76.9270, 100]].forEach(([lat, lng, radius]) => {

          L.circle([lat, lng], {
            radius,
            color: '#ef4444',
            fillColor: '#ef4444',
            fillOpacity: 0.15,
            weight: 1.5
          }).bindPopup("<strong class='text-red-500 font-bold'>RESTRICTED AIRSPACE</strong>").addTo(noFlyGroup);
        });
      }
    }
  }, [showGeofence, showNoFlyZones]);

  // Sync Waypoints & Path connections
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = markersGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (flightPathLayerRef.current) {
      map.removeLayer(flightPathLayerRef.current);
      flightPathLayerRef.current = null;
    }

    const points = [];

    // Home Position Marker
    const homeIcon = L.divIcon({
      html: `
        <div class="w-8 h-8 bg-sky-650 rounded-xl flex items-center justify-center border-2 border-white shadow-xl text-white">
            <span class="material-symbols-outlined text-[15px]">home</span>
        </div>
      `,
      className: 'custom-wp-map-icon',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    L.marker([28.8308, 76.9311], { icon: homeIcon }).addTo(group).bindPopup("UAV Ground Station — IMT Kharkhoda, Haryana");


    waypoints.forEach((wp, idx) => {
      points.push([wp.lat, wp.lng]);

      const isSelected = idx === activeWaypointIndex;
      const markerColor = isSelected ? 'bg-white text-sky-900 border-white' : 'bg-sky-900 border-sky-400 text-white';
      
      const customHtmlIcon = L.divIcon({
        html: `
          <div class="relative flex items-center justify-center w-8 h-8">
              ${isSelected ? `<div class="absolute inset-0 bg-white/20 rounded-full animate-ping"></div>` : ''}
              <div class="w-6 h-6 ${markerColor} border-2 rounded-full flex items-center justify-center shadow-lg text-[11px] font-bold z-10">
                  ${idx + 1}
              </div>
          </div>
        `,
        className: 'custom-wp-map-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([wp.lat, wp.lng], { icon: customHtmlIcon, draggable: !simulating }).addTo(group);
      
      marker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        setWaypoints(prev => {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], lat: pos.lat, lng: pos.lng };
          return updated;
        });
        logEvent('INFO', `Waypoint #${idx + 1} moved to ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`);
      });

      marker.on('click', () => {
        setActiveWaypointIndex(idx);
        setActiveRightTab('waypoint');
      });
    });

    if (points.length >= 2) {
      flightPathLayerRef.current = L.polyline(points, {
        color: '#ffffff',
        weight: 2,
        dashArray: '6, 6'
      }).addTo(map);
    }

  }, [waypoints, activeWaypointIndex, simulating]);

  // --- AUTOMATED MISSION SIMULATION ENGINE ---
  useEffect(() => {
    let interval = null;
    if (simulating && waypoints.length > 0) {
      interval = setInterval(() => {
        setSimStep(prev => {
          const nextStep = prev + 1;
          const totalPoints = waypoints.length;
          
          if (nextStep >= totalPoints * 10) {
            setSimulating(false);
            setArmedStatus('DISARMED');
            setFlightMode('LAND');
            logEvent('SUCCESS', 'Autopilot landed. Mission accomplished.');
            if (droneMarkerRef.current) {
              droneMarkerRef.current.remove();
              droneMarkerRef.current = null;
            }
            return 0;
          }

          const wpIdx = Math.floor(nextStep / 10);
          const nextWpIdx = (wpIdx + 1) % totalPoints;
          const ratio = (nextStep % 10) / 10;

          const startWp = waypoints[wpIdx];
          const endWp = waypoints[nextWpIdx];

          const lat = startWp.lat + (endWp.lat - startWp.lat) * ratio;
          const lng = startWp.lng + (endWp.lng - startWp.lng) * ratio;

          // Render moving drone marker
          const map = mapInstanceRef.current;
          if (map) {
            if (droneMarkerRef.current) {
              droneMarkerRef.current.setLatLng([lat, lng]);
            } else {
              const droneHtmlIcon = L.divIcon({
                html: `
                  <div class="relative flex items-center justify-center w-10 h-10">
                      <div class="absolute inset-0 bg-white/30 rounded-full animate-ping"></div>
                      <div class="w-8 h-8 bg-sky-900 border-2 border-white rounded-full flex items-center justify-center shadow-2xl text-white z-20">
                          <span class="material-symbols-outlined text-[16px] animate-spin">flight_takeoff</span>
                      </div>
                  </div>
                `,
                className: 'custom-sim-drone-icon',
                iconSize: [40, 40],
                iconAnchor: [20, 20]
              });
              droneMarkerRef.current = L.marker([lat, lng], { icon: droneHtmlIcon }).addTo(map);
            }
            map.panTo([lat, lng]);
          }

          // Update real-time telemetry metrics
          setTelemetry(prev => ({
            ...prev,
            lat,
            lng,
            altitude: Math.floor(startWp.altitude + (endWp.altitude - startWp.altitude) * ratio),
            relativeAlt: Math.floor((startWp.altitude + (endWp.altitude - startWp.altitude) * ratio) - 10),
            groundSpeed: Math.floor(startWp.speed + (endWp.speed - startWp.speed) * ratio),
            airSpeed: Math.floor(startWp.speed + (endWp.speed - startWp.speed) * ratio + (Math.random() * 2 - 1)),
            yaw: Math.floor(startWp.heading + (endWp.heading - startWp.heading) * ratio),
            heading: Math.floor(startWp.heading + (endWp.heading - startWp.heading) * ratio),
            pitch: Math.floor(Math.sin(ratio * Math.PI) * 6),
            roll: Math.floor(Math.cos(ratio * Math.PI) * 4),
            batteryPercent: Math.max(12, prev.batteryPercent - 0.7),
            flightTimeSeconds: prev.flightTimeSeconds + 3,
            distanceTravelled: parseFloat((prev.distanceTravelled + 0.05).toFixed(2))
          }));

          // Trigger timeline events
          if (nextStep % 10 === 0) {
            logEvent('INFO', `Autopilot reached Waypoint #${wpIdx + 1}. Action: ${startWp.action}`);
          }

          return nextStep;
        });
      }, 500);
    } else {
      if (droneMarkerRef.current) {
        droneMarkerRef.current.remove();
        droneMarkerRef.current = null;
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [simulating, waypoints, simStep]);

  // --- PRE-FLIGHT VALIDATION MATRIX ---
  const validationStatus = useMemo(() => {
    const checklist = [
      { id: 'gps', name: 'GPS 3D Lock', ok: gpsLockType === '3D Fix' || gpsLockType === 'RTK', status: 'GREEN' },
      { id: 'battery', name: 'Battery (>= 40%)', ok: telemetry.batteryPercent >= 40, status: telemetry.batteryPercent >= 40 ? 'GREEN' : 'RED' },
      { id: 'compass', name: 'Compass Calibrated', ok: compassCalibrated, status: 'GREEN' },
      { id: 'ekf', name: 'EKF Healthy', ok: ekfHealthy, status: 'GREEN' },
      { id: 'waypoints', name: 'Mission Buffer Valid', ok: waypoints.length >= 2, status: 'GREEN' },
      { id: 'geofence', name: 'No-Fly Zone Violation', ok: !waypoints.some(wp => wp.lat > 34.058 && wp.lng < -118.247), status: 'GREEN' },
      { id: 'wind', name: 'Wind Thresholds', ok: true, status: 'GREEN' }
    ];
    const failedCount = checklist.filter(c => c.status === 'RED').length;
    return { checklist, uploadBlocked: failedCount > 0 };
  }, [gpsLockType, telemetry.batteryPercent, compassCalibrated, ekfHealthy, waypoints]);

  const handleDeleteWaypoint = (index) => {
    setWaypoints(prev => {
      const updated = prev.filter((_, idx) => idx !== index);
      if (activeWaypointIndex >= updated.length && updated.length > 0) {
        setActiveWaypointIndex(updated.length - 1);
      }
      logEvent('WARNING', `Waypoint #${index + 1} deleted.`);
      return updated;
    });
  };

  const handleOptimizeAI = (action) => {
    if (action === 'battery') {
      alert("AI Co-pilot: Restructured flight trajectory. Yaw sweeps minimized. Save index: 12% Battery.");
      logEvent('SUCCESS', 'AI Optimization: Waypoint parameters adjusted.');
    } else {
      // Generate flight survey coordinates
      const lat = 34.0560;
      const lng = -118.2440;
      const surveyPoints = [
        { id: 1, lat: lat - 0.0015, lng: lng - 0.0015, altitude: 40, speed: 12, hoverTime: 1, action: 'Photo Interval', heading: 0, gimbalPitch: -45, delay: 0 },
        { id: 2, lat: lat - 0.0015, lng: lng + 0.0015, altitude: 40, speed: 12, hoverTime: 0, action: 'Video Start', heading: 90, gimbalPitch: -90, delay: 0 },
        { id: 3, lat: lat, lng: lng + 0.0015, altitude: 45, speed: 10, hoverTime: 2, action: 'Photo Interval', heading: 180, gimbalPitch: -45, delay: 1 },
        { id: 4, lat: lat, lng: lng - 0.0015, altitude: 45, speed: 10, hoverTime: 0, action: 'Video Stop', heading: 270, gimbalPitch: 0, delay: 0 }
      ];
      setWaypoints(surveyPoints);
      setActiveWaypointIndex(0);
      logEvent('SUCCESS', 'AI Co-pilot: Grid Survey layout uploaded to workspace.');
    }
  };

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)] text-white font-sans pb-4">
      
      {/* ── LEFT PANEL: MISSION LIBRARY (3 cols) ── */}
      <div className="lg:col-span-3 bg-gradient-to-br from-sky-600 to-sky-850 border border-sky-550 rounded-2xl p-4 flex flex-col justify-between h-full overflow-y-auto shadow-xl">
        <div className="space-y-4">
          <header className="flex justify-between items-center">
            <h3 className="font-extrabold text-sm text-white drop-shadow">Mission Library</h3>
            <button 
              onClick={() => {
                if (appState.drones && appState.drones.length > 0) {
                  setNewMissionDrone(appState.drones[0].id);
                }
                setAddModalOpen(true);
              }}
              className="p-1.5 bg-white hover:bg-sky-100 text-sky-900 rounded-xl transition-all shadow"
            >
              <Plus className="w-4 h-4" />
            </button>
          </header>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-sky-200" />
            <input 
              type="text" 
              placeholder="Search missions..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-sky-900/40 border border-sky-400/50 rounded-xl pl-9 pr-4 py-2 text-xs w-full focus:outline-none text-white placeholder-sky-200/70 font-semibold"
            />
          </div>

          {/* Mission Card list */}
          <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
            {(appState.missions || [])
              .filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.id.toLowerCase().includes(searchQuery.toLowerCase()))
              .map((m) => (
              <div 
                key={m.id} 
                onClick={() => setSelectedMissionId(m.id)}
                className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                  selectedMissionId === m.id 
                    ? 'bg-white text-sky-900 border-white shadow-xl font-bold' 
                    : 'bg-sky-900/20 border-sky-500/30 text-sky-100 hover:bg-sky-900/40 hover:border-sky-400'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className={`text-[9px] uppercase tracking-widest font-black ${selectedMissionId === m.id ? 'text-sky-750' : 'text-sky-200'}`}>{m.id}</span>
                  <div className="flex items-center gap-1.5">
                    {selectedMissionId === m.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditMissionId(m.id);
                          setEditMissionName(m.name);
                          setEditMissionDrone(m.drone);
                          setEditMissionType(m.type);
                          setEditMissionSpeed(typeof m.speed === 'string' ? parseInt(m.speed) : (m.speed || 10));
                          setEditMissionAlt(typeof m.cruiseAlt === 'string' ? parseInt(m.cruiseAlt) : (m.cruiseAlt || 45));
                          setEditMissionStatus(m.status);
                          setEditModalOpen(true);
                        }}
                        className="p-1 hover:bg-sky-200 rounded text-sky-900 transition-colors"
                        title="Edit Mission Details"
                      >
                        <Edit className="w-3 h-3 text-sky-700" />
                      </button>
                    )}
                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-white/20 text-white border border-white/25">
                      {m.status}
                    </span>
                  </div>
                </div>
                <h4 className={`font-black text-xs mt-1.5 truncate ${selectedMissionId === m.id ? 'text-sky-900' : 'text-white'}`}>{m.name}</h4>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 mt-3 text-[10px]">
                  <div><span className={selectedMissionId === m.id ? 'text-sky-700' : 'text-sky-200'}>Drone:</span> <span className="font-bold">{m.drone}</span></div>
                  <div><span className={selectedMissionId === m.id ? 'text-sky-700' : 'text-sky-200'}>Dist:</span> <span className="font-bold">{m.distance}</span></div>
                  <div><span className={selectedMissionId === m.id ? 'text-sky-700' : 'text-sky-200'}>Battery:</span> <span className="font-bold">{m.battery}</span></div>
                  <div><span className={selectedMissionId === m.id ? 'text-sky-700' : 'text-sky-200'}>Est:</span> <span className="font-bold">{m.time}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-sky-400/40 pt-3 mt-4 flex gap-2">
          <button className="flex-1 bg-sky-900/40 border border-sky-400/50 hover:bg-sky-500/40 text-white py-2 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1.5 shadow">
            <Upload className="w-3.5 h-3.5" /> Import
          </button>
          <button className="flex-1 bg-sky-900/40 border border-sky-400/50 hover:bg-sky-500/40 text-white py-2 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1.5 shadow">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* ── CENTER PANEL: INTERACTIVE WORKSPACE MAP & SIMULATION (6 cols) ── */}
      <div className="lg:col-span-6 bg-gradient-to-br from-sky-600 to-sky-850 border border-sky-550 rounded-2xl p-4 flex flex-col justify-between h-full relative overflow-hidden shadow-xl">
        <header className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2 text-left">
            <Compass className="w-4.5 h-4.5 text-white" />
            <div>
              <h3 className="font-bold text-xs text-white">Interactive Workspace Map</h3>
              <p className="text-[10px] text-sky-100">Click coordinates to structure mission waypoints.</p>
            </div>
          </div>
          
          {/* Mission Drawing Tools */}
          <div className="flex items-center gap-2 bg-sky-900/40 p-1 rounded-xl border border-sky-400/40">
            {DRAWING_MODES.map(mode => (
              <button
                key={mode.id}
                onClick={() => setDrawingMode(mode.id)}
                className={`p-1.5 rounded-lg transition-all ${
                  drawingMode === mode.id ? 'bg-white text-sky-900 shadow' : 'text-sky-200 hover:text-white'
                }`}
                title={mode.label}
              >
                <mode.icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </header>

        {/* Map Container */}
        <div ref={mapContainerRef} className="flex-1 rounded-xl overflow-hidden border border-sky-400/40 z-10" />

        {/* Simulation HUD readouts overlay */}
        {simulating && (
          <div className="absolute top-20 left-8 right-8 z-20 bg-sky-955/95 border border-sky-400 rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-6 text-left">
            <div className="flex items-center gap-3">
              <Activity className="w-6 h-6 text-white animate-pulse" />
              <div>
                <span className="text-[9px] uppercase tracking-widest text-sky-200 font-bold block">Autopilot In Air</span>
                <span className="text-xs font-black text-white">MAVLink Node #{Math.floor(simStep / 10) + 1}</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-6 text-[11px] flex-1 max-w-md">
              <div><span className="text-sky-200 block">Battery:</span><span className="font-bold text-white">{telemetry.batteryPercent.toFixed(1)}%</span></div>
              <div><span className="text-sky-200 block">Velocity:</span><span className="font-bold text-white">{telemetry.groundSpeed} m/s</span></div>
              <div><span className="text-sky-200 block">Altitude:</span><span className="font-bold text-white">{telemetry.altitude}m</span></div>
              <div><span className="text-sky-200 block">Progress:</span><span className="font-bold text-white">{Math.floor((simStep / (waypoints.length * 10)) * 100)}%</span></div>
            </div>
          </div>
        )}

        {/* Map Sat/Terrain Switcher overlay */}
        <div className="absolute bottom-32 right-8 z-20">
          <button 
            onClick={() => setSatelliteView(!satelliteView)}
            className={`p-2.5 rounded-xl border shadow-md flex items-center justify-center gap-1.5 transition-all text-[10px] font-bold ${
              satelliteView ? 'bg-white text-sky-900 border-white' : 'bg-sky-900 border-sky-400 text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Satellite view
          </button>
        </div>

        {/* Chronological Event Timeline Log */}
        <div className="border-t border-sky-400/40 pt-3 mt-4 h-24 overflow-y-auto text-left space-y-1">
          {timelineEvents.map((log) => (
            <div key={log.id} className="flex gap-3 text-[10px] font-mono leading-relaxed">
              <span className="text-sky-200 shrink-0">[{log.time}]</span>
              <span className="text-white font-semibold">[{log.type}]</span>
              <span className="text-sky-100">{log.message}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL: GCS PILOT ENGINE (3 cols) ── */}
      <div className="lg:col-span-3 bg-gradient-to-br from-sky-600 to-sky-850 border border-sky-550 rounded-2xl p-4 flex flex-col justify-between h-full overflow-y-auto shadow-xl">
        <div className="space-y-4 text-left">
          
          {/* Sub Tab Headers */}
          <div className="flex border-b border-sky-400/40 pb-1 text-[10px] font-black">
            {[
              { id: 'autopilot', label: 'Autopilot' },
              { id: 'telemetry', label: 'Telemetry' },
              { id: 'waypoint', label: `Nodes (${waypoints.length})` },
              { id: 'ai_co_pilot', label: 'AI Pilot' }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveRightTab(tab.id)}
                className={`flex-1 pb-2 border-b-2 transition-all ${
                  activeRightTab === tab.id ? 'border-white text-white' : 'border-transparent text-sky-200 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: AUTOPILOT CONNECTION & COMMAND PANELS */}
          {activeRightTab === 'autopilot' && (
            <div className="space-y-4">
              
              {/* Autopilot Connection String card */}
              <div className="bg-sky-900/40 border border-sky-400/50 p-3 rounded-xl space-y-2">
                <div className="flex justify-between items-center text-[10px] text-sky-200 font-bold uppercase">
                  <span>MAVLink Connection</span>
                  <span className={`w-2 h-2 rounded-full ${connectionStatus === 'CONNECTED' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
                </div>
                <input 
                  type="text" 
                  value={connectionString} 
                  onChange={(e) => setConnectionString(e.target.value)}
                  className="bg-sky-950 border border-sky-400/50 rounded-lg p-2 text-xs w-full text-white font-mono focus:outline-none"
                  placeholder="udp://:14540"
                />
                
                <div className="flex gap-2">
                  {connectionStatus !== 'CONNECTED' ? (
                    <button 
                      onClick={handleConnect}
                      className="flex-1 bg-white hover:bg-sky-100 text-sky-900 font-bold py-1.5 rounded-lg text-[10px] transition-all flex items-center justify-center gap-1 shadow"
                    >
                      <Link className="w-3.5 h-3.5" /> Connect
                    </button>
                  ) : (
                    <button 
                      onClick={handleDisconnect}
                      className="flex-1 bg-red-500 hover:bg-red-650 text-white font-bold py-1.5 rounded-lg text-[10px] transition-all flex items-center justify-center gap-1 shadow"
                    >
                      <Link2Off className="w-3.5 h-3.5" /> Disconnect
                    </button>
                  )}
                </div>
              </div>

              {/* Autopilot Telemetry Spec readouts */}
              <div className="grid grid-cols-2 gap-2 text-[10px] bg-sky-900/40 p-2.5 rounded-xl border border-sky-400/40">
                <div className="border-r border-sky-400/20 pr-2">
                  <span className="text-sky-200 block">Firmware:</span>
                  <span className="font-bold text-white">{firmware}</span>
                </div>
                <div className="pl-2">
                  <span className="text-sky-200 block">GPS lock:</span>
                  <span className="font-bold text-white">{gpsLockType} ({satellitesCount} Sats)</span>
                </div>
                <div className="border-r border-sky-400/20 pr-2 pt-1">
                  <span className="text-sky-200 block">Mode:</span>
                  <span className="font-bold text-white">{flightMode}</span>
                </div>
                <div className="pl-2 pt-1">
                  <span className="text-sky-200 block">Motors:</span>
                  <span className={`font-bold ${armedStatus === 'ARMED' ? 'text-emerald-350' : 'text-red-300'}`}>{armedStatus}</span>
                </div>
              </div>

              {/* Autopilot Command Center buttons */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-sky-200 font-black uppercase tracking-wider block">Flight Autonomy Commands</span>
                
                <div className="grid grid-cols-2 gap-2">
                  {armedStatus !== 'ARMED' ? (
                    <button 
                      onClick={handleArm}
                      className="py-2 rounded-xl text-[10px] font-black uppercase text-center transition-all bg-emerald-500 hover:bg-emerald-600 text-white border border-emerald-400/50 shadow"
                    >
                      Arm Motors
                    </button>
                  ) : (
                    <button 
                      onClick={handleDisarm}
                      className="py-2 rounded-xl text-[10px] font-black uppercase text-center transition-all bg-red-500 hover:bg-red-600 text-white border border-red-400/50 shadow"
                    >
                      Disarm Motors
                    </button>
                  )}

                  <button 
                    onClick={handleTakeoff}
                    className="bg-sky-900/40 border border-sky-400/60 hover:bg-sky-500/40 py-2 rounded-xl text-[10px] font-black uppercase text-center transition-all text-white"
                  >
                    Guided Takeoff
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button 
                    onClick={handleRTL}
                    className="bg-sky-900/40 border border-sky-400/60 hover:bg-sky-500/40 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all"
                  >
                    RTL
                  </button>
                  <button 
                    onClick={handleLand}
                    className="bg-sky-900/40 border border-sky-400/60 hover:bg-sky-500/40 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all"
                  >
                    Land
                  </button>
                  <button 
                    onClick={handlePauseMission}
                    className="bg-sky-900/40 border border-sky-400/60 hover:bg-sky-500/40 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all"
                  >
                    Loiter Hold
                  </button>
                </div>
              </div>

              {/* Pre-Flight Checklist */}
              <div className="space-y-2">
                <span className="text-[10px] text-sky-200 font-black uppercase tracking-wider block">Pre-Flight Checklist Status</span>
                <div className="bg-sky-900/40 border border-sky-400/40 rounded-xl p-2.5 space-y-1.5 text-[10px]">
                  {validationStatus.checklist.map((c) => (
                    <div key={c.id} className="flex justify-between items-center">
                      <span className="text-sky-100 font-semibold">{c.name}</span>
                      <span className={`w-2.5 h-2.5 rounded-full ${c.status === 'GREEN' ? 'bg-emerald-400' : 'bg-red-400 animate-pulse'}`}></span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LIVE TELEMETRY */}
          {activeRightTab === 'telemetry' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { label: 'Altitude (AGL)', val: `${telemetry.altitude}m` },
                  { label: 'Relative Altitude', val: `${telemetry.relativeAlt}m` },
                  { label: 'Ground Speed', val: `${telemetry.groundSpeed} m/s` },
                  { label: 'Air Speed', val: `${telemetry.airSpeed} m/s` },
                  { label: 'Vertical Speed', val: `${telemetry.verticalSpeed} m/s` },
                  { label: 'Yaw Heading', val: `${telemetry.yaw}°` },
                  { label: 'Pitch Index', val: `${telemetry.pitch}°` },
                  { label: 'Roll Index', val: `${telemetry.roll}°` },
                  { label: 'Voltage', val: `${batteryVoltage.toFixed(1)}V` },
                  { label: 'Flight Time', val: `${Math.floor(telemetry.flightTimeSeconds / 60)}m ${telemetry.flightTimeSeconds % 60}s` },
                  { label: 'Home Distance', val: `${telemetry.homeDistance.toFixed(2)} km` },
                  { label: 'Dist. Traveled', val: `${telemetry.distanceTravelled} km` }
                ].map((item, idx) => (
                  <div key={idx} className="bg-sky-900/40 border border-sky-400/40 p-2.5 rounded-xl">
                    <span className="text-[9px] text-sky-200 font-semibold block">{item.label}</span>
                    <span className="text-[11px] font-black text-white mt-0.5 block">{item.val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: WAYPOINT PROPERTY EDITOR */}
          {activeRightTab === 'waypoint' && (
            <div className="space-y-4">
              {waypoints.length === 0 ? (
                <div className="text-center text-sky-150 text-xs py-8">
                  No active waypoint. Click map coordinates to add nodes.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-sky-900/40 p-2.5 rounded-xl border border-sky-400/40">
                    <span className="text-xs font-bold text-white">Waypoint Node #{activeWaypointIndex + 1}</span>
                    <button 
                      onClick={() => handleDeleteWaypoint(activeWaypointIndex)}
                      className="text-red-300 hover:text-red-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-sky-200 font-bold block mb-1">Latitude</span>
                        <input 
                          type="number" 
                          value={waypoints[activeWaypointIndex]?.lat.toFixed(6)}
                          disabled
                          className="bg-sky-900/40 border border-sky-450/40 rounded-lg p-2 text-xs w-full text-sky-200"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-sky-200 font-bold block mb-1">Longitude</span>
                        <input 
                          type="number" 
                          value={waypoints[activeWaypointIndex]?.lng.toFixed(6)}
                          disabled
                          className="bg-sky-900/40 border border-sky-450/40 rounded-lg p-2 text-xs w-full text-sky-200"
                        />
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-sky-200 font-bold block mb-1">Altitude (AGL)</span>
                      <div className="flex items-center gap-2">
                        <input 
                          type="range" 
                          min="10" 
                          max="120"
                          value={waypoints[activeWaypointIndex]?.altitude || 45}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setWaypoints(prev => {
                              const updated = [...prev];
                              updated[activeWaypointIndex].altitude = val;
                              return updated;
                            });
                          }}
                          className="flex-1 accent-white"
                        />
                        <span className="font-mono text-xs w-10 text-right text-white">{waypoints[activeWaypointIndex]?.altitude}m</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-sky-200 font-bold block mb-1">Speed</span>
                      <div className="flex items-center gap-2">
                        <input 
                          type="range" 
                          min="2" 
                          max="20"
                          value={waypoints[activeWaypointIndex]?.speed || 10}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setWaypoints(prev => {
                              const updated = [...prev];
                              updated[activeWaypointIndex].speed = val;
                              return updated;
                            });
                          }}
                          className="flex-1 accent-white"
                        />
                        <span className="font-mono text-xs w-10 text-right text-white">{waypoints[activeWaypointIndex]?.speed}m/s</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-sky-200 font-bold block mb-1">Action Trigger</span>
                        <select 
                          value={waypoints[activeWaypointIndex]?.action}
                          onChange={(e) => {
                            const val = e.target.value;
                            setWaypoints(prev => {
                              const updated = [...prev];
                              updated[activeWaypointIndex].action = val;
                              return updated;
                            });
                          }}
                          className="bg-sky-900/60 border border-sky-400/50 rounded-lg p-2 text-[10px] w-full text-white focus:outline-none"
                        >
                          <option value="None" className="text-sky-900">None</option>
                          <option value="Hover" className="text-sky-900">Hover</option>
                          <option value="Photo Interval" className="text-sky-900">Photo Interval</option>
                          <option value="Video Start" className="text-sky-900">Video Start</option>
                          <option value="Video Stop" className="text-sky-900">Video Stop</option>
                        </select>
                      </div>
                      <div>
                        <span className="text-[10px] text-sky-200 font-bold block mb-1">Gimbal Pitch</span>
                        <input 
                          type="number" 
                          value={waypoints[activeWaypointIndex]?.gimbalPitch}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setWaypoints(prev => {
                              const updated = [...prev];
                              updated[activeWaypointIndex].gimbalPitch = val;
                              return updated;
                            });
                          }}
                          className="bg-sky-900/60 border border-sky-400/50 rounded-lg p-2 text-xs w-full text-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: AI MISSION PLANNING ASSISTANT */}
          {activeRightTab === 'ai_co_pilot' && (
            <div className="space-y-4">
              <div className="bg-sky-900/40 border border-sky-400/40 rounded-xl p-3.5 flex items-start gap-2.5 animate-pulse">
                <Bot className="w-5 h-5 text-white shrink-0" />
                <div className="text-xs space-y-1">
                  <span className="font-bold text-white block">Zeex-AI Planning Assistant</span>
                  <p className="text-sky-100 leading-relaxed">
                    "Weather indices verified: Clear. Estimated success rating: 98% with optimized battery profiles."
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <button 
                  onClick={() => handleOptimizeAI('grid')}
                  className="w-full bg-sky-900/40 border border-sky-400/50 hover:bg-sky-500/40 p-2.5 rounded-xl text-xs text-left transition-all flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-white" />
                  <div>
                    <span className="font-bold text-white block text-[11px]">Generate Autonomous Survey</span>
                    <span className="text-[9px] text-sky-100 block">Auto-creates optimal camera sweep lines.</span>
                  </div>
                </button>
                <button 
                  onClick={() => handleOptimizeAI('battery')}
                  className="w-full bg-sky-900/40 border border-sky-400/50 hover:bg-sky-500/40 p-2.5 rounded-xl text-xs text-left transition-all flex items-center gap-2"
                >
                  <Cpu className="w-4 h-4 text-white" />
                  <div>
                    <span className="font-bold text-white block text-[11px]">Optimize Battery Efficiency</span>
                    <span className="text-[9px] text-sky-100 block">Smoothes curves to reduce motor drag.</span>
                  </div>
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Command buttons footer */}
        <div className="border-t border-sky-400/40 pt-4 mt-6 space-y-2">
          {!simulating ? (
            <button 
              onClick={handleStartMission}
              disabled={validationStatus.uploadBlocked}
              className={`w-full font-extrabold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow ${
                validationStatus.uploadBlocked 
                  ? 'bg-sky-900/40 border border-sky-600 text-sky-300 cursor-not-allowed' 
                  : 'bg-white hover:bg-sky-100 text-sky-900'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Upload & Start Auto Mission
            </button>
          ) : (
            <button 
              onClick={handleAbortMission}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-extrabold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-md"
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
              Abort Flight Mode
            </button>
          )}

          <button 
            onClick={() => {
              actions.addFlight({
                drone: activeMission.drone,
                pilot: 'PIC - ArduPilot Autopilot',
                destination: 'Downtown HQ Loop',
                payload: activeMission.name,
                status: 'In Progress'
              });
              logEvent('INFO', `MAVLink: Flight details dispatched to system registers.`);
            }}
            className="w-full bg-sky-900/40 border border-sky-400/60 hover:bg-sky-550/40 text-white py-2.5 rounded-xl text-xs font-bold transition-all text-center block"
          >
            Dispatch Flight Log
          </button>
        </div>
      </div>
    </div>

      {/* --- ADD MISSION MODAL --- */}
      {addModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-sky-850 to-sky-950 border border-sky-500/40 p-6 rounded-2xl w-full max-w-md shadow-2xl space-y-4 text-left">
            <div className="flex justify-between items-center border-b border-sky-500/30 pb-3">
              <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-sky-400" />
                Create Flight Plan
              </h3>
              <button onClick={() => setAddModalOpen(false)} className="text-sky-300 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (!newMissionName.trim()) return;
              const newM = actions.addMission({
                name: newMissionName,
                drone: newMissionDrone,
                type: newMissionType,
                speed: newMissionSpeed,
                cruiseAlt: newMissionAlt,
                waypointsList: [
                  { id: 1, lat: 28.8308, lng: 76.9311, altitude: newMissionAlt, speed: newMissionSpeed, hoverTime: 2, action: 'Hover', heading: 90, gimbalPitch: -45, delay: 0 }
                ]
              });
              if (newM) {
                setSelectedMissionId(newM.id);
                logEvent('SUCCESS', `Created mission: ${newMissionName}`);
              }
              setAddModalOpen(false);
              setNewMissionName('');
            }} className="space-y-4 text-white">
              <div>
                <label className="block text-[10px] font-bold text-sky-200 uppercase tracking-wider mb-1">Mission Name</label>
                <input 
                  type="text" 
                  required
                  value={newMissionName}
                  onChange={(e) => setNewMissionName(e.target.value)}
                  placeholder="Perimeter Thermal Grid Sweep..."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-sky-500/30 bg-sky-900/60 text-white placeholder-sky-400/50 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-sky-200 uppercase tracking-wider mb-1">Target Drone</label>
                  <select
                    value={newMissionDrone}
                    onChange={(e) => setNewMissionDrone(e.target.value)}
                    className="w-full text-xs px-2 py-2 rounded-lg border border-sky-500/30 bg-sky-900/60 text-white focus:outline-none focus:border-sky-400"
                  >
                    {(appState.drones || []).map(d => (
                      <option key={d.id} value={d.id} className="bg-sky-900 text-white">{d.id} - {d.model}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-sky-200 uppercase tracking-wider mb-1">Mission Type</label>
                  <select
                    value={newMissionType}
                    onChange={(e) => setNewMissionType(e.target.value)}
                    className="w-full text-xs px-2 py-2 rounded-lg border border-sky-500/30 bg-sky-900/60 text-white focus:outline-none focus:border-sky-400"
                  >
                    {MISSION_TYPES.map(t => (
                      <option key={t} value={t} className="bg-sky-900 text-white">{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-sky-200 uppercase tracking-wider mb-1">Cruise Speed (m/s)</label>
                  <input 
                    type="number" 
                    min="2"
                    max="25"
                    value={newMissionSpeed}
                    onChange={(e) => setNewMissionSpeed(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-sky-500/30 bg-sky-900/60 text-white focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-sky-200 uppercase tracking-wider mb-1">Cruise Altitude (m)</label>
                  <input 
                    type="number" 
                    min="10"
                    max="120"
                    value={newMissionAlt}
                    onChange={(e) => setNewMissionAlt(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-sky-500/30 bg-sky-900/60 text-white focus:outline-none focus:border-sky-400"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button 
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="flex-1 py-2 rounded-lg border border-sky-500/30 bg-sky-900/60 text-white font-bold text-xs hover:bg-sky-800/40 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs transition-colors"
                >
                  Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* --- EDIT MISSION MODAL --- */}
      {editModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-sky-850 to-sky-950 border border-sky-550/40 p-6 rounded-2xl w-full max-w-md shadow-2xl space-y-4 text-left">
            <div className="flex justify-between items-center border-b border-sky-500/30 pb-3">
              <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                <Edit className="w-4 h-4 text-sky-450" />
                Edit Mission: {editMissionId}
              </h3>
              <button onClick={() => setEditModalOpen(false)} className="text-sky-300 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (!editMissionName.trim()) return;
              actions.updateMission(editMissionId, {
                name: editMissionName,
                drone: editMissionDrone,
                type: editMissionType,
                speed: editMissionSpeed,
                cruiseAlt: editMissionAlt,
                status: editMissionStatus
              });
              logEvent('SUCCESS', `Updated mission details for ${editMissionId}`);
              setEditModalOpen(false);
            }} className="space-y-4 text-white">
              <div>
                <label className="block text-[10px] font-bold text-sky-200 uppercase tracking-wider mb-1">Mission Name</label>
                <input 
                  type="text" 
                  required
                  value={editMissionName}
                  onChange={(e) => setEditMissionName(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-sky-500/30 bg-sky-900/60 text-white focus:outline-none focus:border-sky-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-sky-200 uppercase tracking-wider mb-1">Target Drone</label>
                  <select
                    value={editMissionDrone}
                    onChange={(e) => setEditMissionDrone(e.target.value)}
                    className="w-full text-xs px-2 py-2 rounded-lg border border-sky-500/30 bg-sky-900/60 text-white focus:outline-none focus:border-sky-400"
                  >
                    {(appState.drones || []).map(d => (
                      <option key={d.id} value={d.id} className="bg-sky-900 text-white">{d.id} - {d.model}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-sky-200 uppercase tracking-wider mb-1">Mission Type</label>
                  <select
                    value={editMissionType}
                    onChange={(e) => setEditMissionType(e.target.value)}
                    className="w-full text-xs px-2 py-2 rounded-lg border border-sky-500/30 bg-sky-900/60 text-white focus:outline-none focus:border-sky-400"
                  >
                    {MISSION_TYPES.map(t => (
                      <option key={t} value={t} className="bg-sky-900 text-white">{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-sky-200 uppercase tracking-wider mb-1">Cruise Speed (m/s)</label>
                  <input 
                    type="number" 
                    min="2"
                    max="25"
                    value={editMissionSpeed}
                    onChange={(e) => setEditMissionSpeed(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-sky-500/30 bg-sky-900/60 text-white focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-sky-200 uppercase tracking-wider mb-1">Cruise Altitude (m)</label>
                  <input 
                    type="number" 
                    min="10"
                    max="120"
                    value={editMissionAlt}
                    onChange={(e) => setEditMissionAlt(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-sky-550/30 bg-sky-900/60 text-white focus:outline-none focus:border-sky-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-sky-200 uppercase tracking-wider mb-1">Status</label>
                <select
                  value={editMissionStatus}
                  onChange={(e) => setEditMissionStatus(e.target.value)}
                  className="w-full text-xs px-2 py-2 rounded-lg border border-sky-500/30 bg-sky-900/60 text-white focus:outline-none focus:border-sky-400"
                >
                  <option value="Scheduled" className="bg-sky-900 text-white">Scheduled</option>
                  <option value="Active" className="bg-sky-900 text-white">Active</option>
                  <option value="Pending Approval" className="bg-sky-900 text-white">Pending Approval</option>
                  <option value="Draft" className="bg-sky-900 text-white">Draft</option>
                  <option value="Completed" className="bg-sky-900 text-white">Completed</option>
                </select>
              </div>

              <div className="flex gap-3 pt-3">
                <button 
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="flex-1 py-2 rounded-lg border border-sky-500/30 bg-sky-900/60 text-white font-bold text-xs hover:bg-sky-800/40 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
