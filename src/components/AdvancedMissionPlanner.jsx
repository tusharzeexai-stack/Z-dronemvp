import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Search, Plus, Play, Pause, Save, Upload, Download, Compass, 
  Wind, Trash2, Layers, Settings, Activity, Cpu, ShieldAlert, 
  Sparkles, Battery, Maximize2, ChevronRight, Info, Navigation, 
  Eye, Bot, CheckCircle, MapPin, AlertCircle, RefreshCw, X, Sliders, Check
} from 'lucide-react';

// --- MOCK RAW DATABASES ---
const MOCK_MISSIONS = [
  { id: 'MSN-PLA-101', name: 'Downtown Highrise Roof Scan', drone: 'ZD-109', type: 'Roof Inspection', status: 'Draft', time: '18m 40s', distance: '5.2 km', battery: '42%', coverage: '92%', waypoints: 8, speed: '10 m/s', cruiseAlt: '45m', date: '2026-06-25' },
  { id: 'MSN-PLA-102', name: 'Westside Grid Security Patrol', drone: 'ZD-088', type: 'Security Patrol', status: 'Scheduled', time: '35m 12s', distance: '10.8 km', battery: '78%', coverage: '98%', waypoints: 14, speed: '12 m/s', cruiseAlt: '30m', date: '2026-06-25' },
  { id: 'MSN-PLA-103', name: 'Solar Array Thermal Mapping', drone: 'ZD-112', type: 'Thermal Inspection', status: 'Completed', time: '24m 50s', distance: '7.4 km', battery: '60%', coverage: '95%', waypoints: 10, speed: '8 m/s', cruiseAlt: '15m', date: '2026-06-24' },
  { id: 'MSN-PLA-104', name: 'East Side Pipeline Corridor Scan', drone: 'ZD-055', type: 'Pipeline Inspection', status: 'Draft', time: '40m 15s', distance: '12.6 km', battery: '85%', coverage: '88%', waypoints: 18, speed: '14 m/s', cruiseAlt: '50m', date: '2026-06-23' }
];

const MISSION_TYPES = [
  'Manual Mission', 'Waypoint Mission', 'Survey Mission', 'Grid Survey',
  'Agriculture Spray', 'Security Patrol', 'Thermal Inspection', 'Infrastructure Inspection',
  'Construction Monitoring', 'Mining Survey', 'Powerline Inspection', 'Pipeline Inspection',
  'Disaster Assessment', 'Search and Rescue', 'Delivery Mission', 'Wildlife Monitoring'
];

const DRAWING_MODES = [
  { id: 'point', label: 'Point Mission', icon: MapPin },
  { id: 'polygon', label: 'Polygon Survey', icon: Layers },
  { id: 'grid', label: 'Grid Survey', icon: Sliders },
  { id: 'orbit', label: 'Circular Orbit', icon: Compass },
  { id: 'powerline', label: 'Powerline Inspection', icon: Navigation }
];

export default function AdvancedMissionPlanner({ appState, actions, getApiUrl }) {
  // --- STATE ---
  const [selectedMissionId, setSelectedMissionId] = useState('MSN-PLA-101');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState('overview'); // overview, waypoint, ai_planner
  
  // Waypoint list
  const [waypoints, setWaypoints] = useState([
    { id: 1, lat: 34.0522, lng: -118.2437, altitude: 45, speed: 10, hoverTime: 2, action: 'Photo Interval', heading: 90 },
    { id: 2, lat: 34.0535, lng: -118.2415, altitude: 45, speed: 10, hoverTime: 0, action: 'Video Start', heading: 120 },
    { id: 3, lat: 34.0550, lng: -118.2400, altitude: 50, speed: 8, hoverTime: 5, action: 'Hover', heading: 180 },
    { id: 4, lat: 34.0572, lng: -118.2388, altitude: 50, speed: 12, hoverTime: 0, action: 'None', heading: 240 }
  ]);
  const [activeWaypointIndex, setActiveWaypointIndex] = useState(0);

  // Map Controls
  const [satelliteView, setSatelliteView] = useState(false);
  const [drawingMode, setDrawingMode] = useState('point');
  const [showGeofence, setShowGeofence] = useState(true);
  const [showNoFlyZones, setShowNoFlyZones] = useState(true);

  // Simulation state
  const [simulating, setSimulating] = useState(false);
  const [simStep, setSimStep] = useState(0);
  const [simProgress, setSimProgress] = useState(0);
  const [simBattery, setSimBattery] = useState(100);
  const [simAlt, setSimAlt] = useState(0);
  const [simSpeed, setSimSpeed] = useState(0);
  const [simLogs, setSimLogs] = useState([]);

  // Leaflet Map Refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersGroupRef = useRef(null);
  const flightPathLayerRef = useRef(null);
  const geofenceLayerRef = useRef(null);
  const noFlyZonesGroupRef = useRef(null);
  const droneMarkerRef = useRef(null);
  const tileLayerRef = useRef(null);

  const activeMission = useMemo(() => {
    return MOCK_MISSIONS.find(m => m.id === selectedMissionId) || MOCK_MISSIONS[0];
  }, [selectedMissionId]);

  // --- MAP & LAYOUT SYNCHRONIZATION ---

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [34.055, -118.242],
      zoom: 15,
      zoomControl: false,
      attributionControl: false
    });
    mapInstanceRef.current = map;

    // Tile Layers
    const tileUrl = satelliteView 
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    tileLayerRef.current = L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);

    markersGroupRef.current = L.layerGroup().addTo(map);
    noFlyZonesGroupRef.current = L.layerGroup().addTo(map);

    // Map Click Listener to add Waypoints in Point Mode
    map.on('click', (e) => {
      if (simulating) return;
      const { lat, lng } = e.latlng;
      
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
          heading: 90
        };
        const updated = [...prev, newWp];
        setActiveWaypointIndex(updated.length - 1);
        setSelectedTab('waypoint');
        return updated;
      });
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [satelliteView, simulating]);

  // Sync Geofences & No-Fly Zones
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (geofenceLayerRef.current) {
      map.removeLayer(geofenceLayerRef.current);
      geofenceLayerRef.current = null;
    }

    if (showGeofence) {
      // Define a realistic polygon representing our operations boundary
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
        color: '#06b6d4',
        fillColor: '#06b6d4',
        fillOpacity: 0.08,
        weight: 2,
        dashArray: '6, 6'
      }).addTo(map);
    }

    // No-fly zones
    const noFlyGroup = noFlyZonesGroupRef.current;
    if (noFlyGroup) {
      noFlyGroup.clearLayers();
      if (showNoFlyZones) {
        // Mock No-fly airspaces (e.g. over Downtown buildings / heliports)
        [[34.0585, -118.2480, 150], [34.0535, -118.2415, 100]].forEach(([lat, lng, radius]) => {
          L.circle([lat, lng], {
            radius,
            color: '#ef4444',
            fillColor: '#ef4444',
            fillOpacity: 0.25,
            weight: 2
          }).bindPopup("<strong class='text-red-500 font-bold'>RESTRICTED AIRSPACE</strong><br/>No-Fly Airspace Zone").addTo(noFlyGroup);
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

    waypoints.forEach((wp, idx) => {
      points.push([wp.lat, wp.lng]);

      const isSelected = idx === activeWaypointIndex;
      const markerColor = isSelected ? 'bg-cyan-400 border-white' : 'bg-slate-700 border-slate-600';
      
      const customHtmlIcon = L.divIcon({
        html: `
          <div class="relative flex items-center justify-center w-8 h-8">
              ${isSelected ? `<div class="absolute inset-0 bg-cyan-400/30 rounded-full animate-ping"></div>` : ''}
              <div class="w-6 h-6 ${markerColor} border-2 rounded-full flex items-center justify-center shadow-lg text-white text-[11px] font-bold z-10">
                  ${idx + 1}
              </div>
          </div>
        `,
        className: 'custom-wp-map-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([wp.lat, wp.lng], { icon: customHtmlIcon, draggable: !simulating }).addTo(group);
      
      // Update coords on drag
      marker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        setWaypoints(prev => {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], lat: pos.lat, lng: pos.lng };
          return updated;
        });
      });

      marker.on('click', () => {
        setActiveWaypointIndex(idx);
        setSelectedTab('waypoint');
      });
    });

    // Draw connecting line
    if (points.length >= 2) {
      flightPathLayerRef.current = L.polyline(points, {
        color: '#06b6d4',
        weight: 3,
        dashArray: '5, 8'
      }).addTo(map);
    }

  }, [waypoints, activeWaypointIndex, simulating]);

  // --- AUTOMATED MISSION SIMULATION ENGINE ---
  useEffect(() => {
    let interval = null;
    if (simulating && waypoints.length > 0) {
      // Setup logs initialized
      if (simStep === 0) {
        setSimLogs([
          { time: '00:00', event: '🔋 Pre-flight battery diagnostics: OK (100% capacity)' },
          { time: '00:02', event: '📡 Gps link locked: 18 satellites active' },
          { time: '00:05', event: '🚀 Drone motors ARMED. Taking off to takeoff hold altitude...' }
        ]);
        setSimBattery(100);
        setSimProgress(0);
      }

      interval = setInterval(() => {
        setSimStep(prev => {
          const nextStep = prev + 1;
          const totalPoints = waypoints.length;
          
          if (nextStep >= totalPoints * 10) {
            // Simulation finished
            setSimulating(false);
            setSimLogs(logs => [
              ...logs,
              { time: '02:45', event: '🏁 Destination reached. Executing automated landing sequence...' },
              { time: '02:50', event: '✅ Mission Completed successfully. Disarming motors.' }
            ]);
            if (droneMarkerRef.current) {
              droneMarkerRef.current.remove();
              droneMarkerRef.current = null;
            }
            return 0;
          }

          // Calculate current waypoint index and fraction
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
                      <div class="absolute inset-0 bg-emerald-400/40 rounded-full animate-ping"></div>
                      <div class="w-8 h-8 bg-emerald-500 border-2 border-white rounded-full flex items-center justify-center shadow-2xl text-white z-20">
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
            // Pan camera to follow drone
            map.panTo([lat, lng]);
          }

          // Update dynamic readouts
          setSimProgress(Math.floor((nextStep / (totalPoints * 10)) * 100));
          setSimBattery(b => Math.max(25, b - 1.2));
          setSimAlt(Math.floor(startWp.altitude + (endWp.altitude - startWp.altitude) * ratio));
          setSimSpeed(Math.floor(startWp.speed + (endWp.speed - startWp.speed) * ratio));

          // Post occasional logs
          if (nextStep % 10 === 0) {
            const currentWpNum = wpIdx + 1;
            setSimLogs(logs => [
              ...logs,
              { time: `00:${nextStep}`, event: `📍 Waypoint #${currentWpNum} reached. Executing action: ${startWp.action}` }
            ]);
          }

          return nextStep;
        });
      }, 350);
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

  // --- ACTIONS ---
  const handleAddWaypoint = (lat, lng) => {
    setWaypoints(prev => [
      ...prev,
      { id: Date.now(), lat, lng, altitude: 45, speed: 10, hoverTime: 2, action: 'Photo Interval', heading: 90 }
    ]);
  };

  const handleDeleteWaypoint = (idx) => {
    setWaypoints(waypoints.filter((_, i) => i !== idx));
    setActiveWaypointIndex(0);
  };

  const handleDuplicateWaypoint = (wp) => {
    setWaypoints(prev => [
      ...prev,
      { ...wp, id: Date.now(), lat: wp.lat + 0.0002, lng: wp.lng + 0.0002 }
    ]);
  };

  const triggerAIPlanner = (type) => {
    // Generate an automatic optimized mission layout on map
    if (type === 'optimize') {
      alert("AI Optimization: Adjusting paths to optimize battery consumption (-14% drag efficiency).");
      return;
    }

    // Grid path generator center coordinates
    const lat = 34.0560;
    const lng = -118.2440;
    const generated = [
      { id: 1, lat: lat - 0.002, lng: lng - 0.002, altitude: 40, speed: 12, hoverTime: 0, action: 'None', heading: 0 },
      { id: 2, lat: lat - 0.002, lng: lng + 0.002, altitude: 40, speed: 12, hoverTime: 1, action: 'Photo Interval', heading: 90 },
      { id: 3, lat: lat, lng: lng + 0.002, altitude: 45, speed: 10, hoverTime: 0, action: 'None', heading: 180 },
      { id: 4, lat: lat, lng: lng - 0.002, altitude: 45, speed: 10, hoverTime: 2, action: 'Photo Interval', heading: 270 },
      { id: 5, lat: lat + 0.002, lng: lng - 0.002, altitude: 50, speed: 8, hoverTime: 0, action: 'None', heading: 0 },
      { id: 6, lat: lat + 0.002, lng: lng + 0.002, altitude: 50, speed: 8, hoverTime: 3, action: 'Video Start', heading: 90 }
    ];
    setWaypoints(generated);
    setActiveWaypointIndex(0);
    alert("Zeex-AI autonomous survey pattern generated successfully based on local topography.");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)] text-slate-100 font-sans pb-4">
      
      {/* ── LEFT PANEL: MISSION LIBRARY (3 cols) ── */}
      <div className="lg:col-span-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between h-full overflow-y-auto">
        <div className="space-y-4">
          <header className="flex justify-between items-center">
            <h3 className="font-extrabold text-sm text-white">Autonomous Missions</h3>
            <button className="p-1.5 bg-cyan-500 hover:bg-cyan-600 text-slate-950 rounded-xl transition-all">
              <Plus className="w-4 h-4" />
            </button>
          </header>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search library..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs w-full focus:outline-none text-slate-200"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-850 text-[10px] font-bold">
            {['All', 'Drafts', 'Scheduled', 'Done'].map(tab => (
              <button key={tab} className="flex-1 py-1 rounded hover:bg-slate-900 transition-colors text-slate-400 hover:text-white">
                {tab}
              </button>
            ))}
          </div>

          {/* Mission Card list */}
          <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
            {MOCK_MISSIONS.map((m) => (
              <div 
                key={m.id} 
                onClick={() => setSelectedMissionId(m.id)}
                className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                  selectedMissionId === m.id 
                    ? 'bg-slate-950 border-cyan-500/50 shadow-md shadow-cyan-500/5' 
                    : 'bg-slate-950/40 border-slate-850 hover:border-slate-700'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest">{m.id}</span>
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${
                    m.status === 'Scheduled' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                    m.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}>{m.status}</span>
                </div>
                <h4 className="font-extrabold text-xs text-slate-200 mt-1.5 truncate">{m.name}</h4>
                <div className="grid grid-cols-3 gap-2 mt-3 text-[10px] text-slate-500">
                  <div><span>Time:</span><span className="font-bold text-slate-400 block">{m.time}</span></div>
                  <div><span>Dist:</span><span className="font-bold text-slate-400 block">{m.distance}</span></div>
                  <div><span>Drone:</span><span className="font-bold text-slate-400 block">{m.drone}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Import / Export / Templates footer actions */}
        <div className="border-t border-slate-850 pt-3 mt-4 flex justify-between gap-2">
          <button className="flex-1 bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-slate-300 py-2 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1.5">
            <Upload className="w-3.5 h-3.5" /> Import
          </button>
          <button className="flex-1 bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-slate-300 py-2 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* ── CENTER PANEL: INTERACTIVE WORKSPACE MAP (6 cols) ── */}
      <div className="lg:col-span-6 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between h-full relative overflow-hidden">
        <header className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2 text-left">
            <Compass className="w-4.5 h-4.5 text-cyan-400" />
            <div>
              <h3 className="font-bold text-xs text-white">GIS Flight Workspace</h3>
              <p className="text-[10px] text-slate-500">Left-click the map to append active path waypoints.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-850">
            {DRAWING_MODES.map(mode => (
              <button
                key={mode.id}
                onClick={() => setDrawingMode(mode.id)}
                className={`p-1.5 rounded-lg transition-all ${
                  drawingMode === mode.id ? 'bg-cyan-500 text-slate-950' : 'text-slate-500 hover:text-slate-200'
                }`}
                title={mode.label}
              >
                <mode.icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </header>

        {/* Leaflet Target Container */}
        <div ref={mapContainerRef} className="flex-1 rounded-xl overflow-hidden border border-slate-850 z-10" />

        {/* Simulation HUD Overlay (during simulation) */}
        {simulating && (
          <div className="absolute top-20 left-8 right-8 z-20 bg-slate-950/95 border border-emerald-500/30 rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-6 text-left">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400">
                <Activity className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <span className="text-[9px] uppercase tracking-widest text-emerald-400 font-bold block">Simulation In Progress</span>
                <span className="text-sm font-extrabold text-white">Path Node #{Math.floor(simStep / 10) + 1}</span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-6 text-xs flex-1 max-w-lg">
              <div><span className="text-slate-500 block">Battery Level:</span><span className="font-bold text-emerald-400">{simBattery.toFixed(1)}%</span></div>
              <div><span className="text-slate-500 block">Velocity:</span><span className="font-bold text-slate-200">{simSpeed} m/s</span></div>
              <div><span className="text-slate-500 block">Altitude AGL:</span><span className="font-bold text-slate-200">{simAlt} m</span></div>
              <div><span className="text-slate-500 block">Completion:</span><span className="font-bold text-slate-200">{simProgress}%</span></div>
            </div>
          </div>
        )}

        {/* Floating layers overlay */}
        <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-2">
          <button 
            onClick={() => setSatelliteView(!satelliteView)}
            className={`p-2.5 rounded-xl border shadow-md flex items-center justify-center gap-1.5 transition-all text-[10px] font-bold ${
              satelliteView ? 'bg-cyan-500 text-slate-950 border-cyan-600' : 'bg-slate-950 border-slate-800 text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Satellite View
          </button>
        </div>

        {/* Custom Timeline Events Log Track at Bottom (3 cols width) */}
        <div className="border-t border-slate-850 pt-3 mt-4 h-24 overflow-y-auto text-left space-y-1">
          {simLogs.length === 0 ? (
            <div className="text-center text-slate-500 text-[10px] py-4">
              Pre-flight checks ready. Press "Simulate Mission" to initialize diagnostics.
            </div>
          ) : (
            simLogs.map((log, idx) => (
              <div key={idx} className="flex gap-3 text-[10px] font-mono leading-relaxed">
                <span className="text-cyan-400 shrink-0">[{log.time}]</span>
                <span className="text-slate-300">{log.event}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL: PROPERTIES, CONTROLS, AI PLANNER (3 cols) ── */}
      <div className="lg:col-span-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between h-full overflow-y-auto">
        <div className="space-y-4 text-left">
          
          {/* Sub Tab Headers */}
          <div className="flex border-b border-slate-800 pb-1 text-[10px] font-bold">
            {[
              { id: 'overview', label: 'Properties' },
              { id: 'waypoint', label: `Waypoint (${waypoints.length})` },
              { id: 'ai_planner', label: 'AI Pilot' }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setSelectedTab(tab.id)}
                className={`flex-1 pb-2 border-b-2 transition-all ${
                  selectedTab === tab.id ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB CONTENT: MISSION OVERVIEW */}
          {selectedTab === 'overview' && (
            <div className="space-y-4">
              <div className="space-y-2 text-xs">
                <div className="flex justify-between border-b border-slate-850/60 py-1.5">
                  <span className="text-slate-500">Selected Mission:</span>
                  <span className="font-bold text-slate-200">{activeMission.name}</span>
                </div>
                <div className="flex justify-between border-b border-slate-850/60 py-1.5">
                  <span className="text-slate-500">Assigned Aircraft:</span>
                  <span className="font-bold text-cyan-400">{activeMission.drone}</span>
                </div>
                <div className="flex justify-between border-b border-slate-850/60 py-1.5">
                  <span className="text-slate-500">Mission Type:</span>
                  <span className="font-bold text-slate-200">{activeMission.type}</span>
                </div>
                <div className="flex justify-between border-b border-slate-850/60 py-1.5">
                  <span className="text-slate-500">Estimated Duration:</span>
                  <span className="font-bold text-slate-200">~{activeMission.time}</span>
                </div>
                <div className="flex justify-between border-b border-slate-850/60 py-1.5">
                  <span className="text-slate-500">Path Distance:</span>
                  <span className="font-bold text-slate-200">{activeMission.distance}</span>
                </div>
                <div className="flex justify-between border-b border-slate-850/60 py-1.5">
                  <span className="text-slate-500">Battery Required:</span>
                  <span className="font-bold text-emerald-400">{activeMission.battery}</span>
                </div>
              </div>

              {/* Geo Boundaries toggles */}
              <div className="bg-slate-950/60 border border-slate-850 p-3 rounded-xl space-y-2.5">
                <label className="flex items-center justify-between text-[10px] font-bold text-slate-400 cursor-pointer">
                  <span>GeoFence Boundary Overlay</span>
                  <input 
                    type="checkbox" 
                    checked={showGeofence} 
                    onChange={(e) => setShowGeofence(e.target.checked)}
                    className="rounded text-cyan-500 focus:ring-cyan-450 w-3.5 h-3.5 bg-slate-900 border-slate-800"
                  />
                </label>
                <label className="flex items-center justify-between text-[10px] font-bold text-slate-400 cursor-pointer">
                  <span>No-Fly Zone Alerts</span>
                  <input 
                    type="checkbox" 
                    checked={showNoFlyZones} 
                    onChange={(e) => setShowNoFlyZones(e.target.checked)}
                    className="rounded text-cyan-500 focus:ring-cyan-450 w-3.5 h-3.5 bg-slate-900 border-slate-800"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB CONTENT: WAYPOINT EDITOR */}
          {selectedTab === 'waypoint' && (
            <div className="space-y-4">
              {waypoints.length === 0 ? (
                <div className="text-center text-slate-500 text-xs py-8">
                  No active waypoints. Click map coordinates to add nodes.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-slate-950/60 p-2.5 rounded-xl border border-slate-850">
                    <span className="text-xs font-bold text-cyan-400">Editing Waypoint #{activeWaypointIndex + 1}</span>
                    <button 
                      onClick={() => handleDeleteWaypoint(activeWaypointIndex)}
                      className="text-rose-400 hover:text-rose-300"
                      title="Delete Waypoint"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block mb-1">Latitude</span>
                        <input 
                          type="number" 
                          value={waypoints[activeWaypointIndex]?.lat.toFixed(5)}
                          disabled
                          className="bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs w-full text-slate-400"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block mb-1">Longitude</span>
                        <input 
                          type="number" 
                          value={waypoints[activeWaypointIndex]?.lng.toFixed(5)}
                          disabled
                          className="bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs w-full text-slate-400"
                        />
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 font-bold block mb-1">Altitude (AGL)</span>
                      <div className="flex items-center gap-2">
                        <input 
                          type="range" 
                          min="10" 
                          max="120"
                          value={waypoints[activeWaypointIndex]?.altitude}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setWaypoints(prev => {
                              const updated = [...prev];
                              updated[activeWaypointIndex].altitude = val;
                              return updated;
                            });
                          }}
                          className="flex-1 accent-cyan-500"
                        />
                        <span className="font-mono text-xs w-10 text-right">{waypoints[activeWaypointIndex]?.altitude}m</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 font-bold block mb-1">Airspeed</span>
                      <div className="flex items-center gap-2">
                        <input 
                          type="range" 
                          min="2" 
                          max="20"
                          value={waypoints[activeWaypointIndex]?.speed}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setWaypoints(prev => {
                              const updated = [...prev];
                              updated[activeWaypointIndex].speed = val;
                              return updated;
                            });
                          }}
                          className="flex-1 accent-cyan-500"
                        />
                        <span className="font-mono text-xs w-10 text-right">{waypoints[activeWaypointIndex]?.speed}m/s</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block mb-1">Action</span>
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
                          className="bg-slate-950 border border-slate-850 rounded-lg p-2 text-[10px] w-full text-slate-200"
                        >
                          <option value="None">None</option>
                          <option value="Hover">Hover</option>
                          <option value="Photo Interval">Photo Interval</option>
                          <option value="Video Start">Video Start</option>
                          <option value="Video Stop">Video Stop</option>
                        </select>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block mb-1">Heading</span>
                        <input 
                          type="number" 
                          value={waypoints[activeWaypointIndex]?.heading}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setWaypoints(prev => {
                              const updated = [...prev];
                              updated[activeWaypointIndex].heading = val;
                              return updated;
                            });
                          }}
                          className="bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs w-full text-slate-200"
                        />
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleDuplicateWaypoint(waypoints[activeWaypointIndex])}
                    className="w-full bg-slate-950 border border-slate-800 hover:border-cyan-500/50 py-2 rounded-xl text-xs font-bold transition-all text-center mt-2"
                  >
                    Duplicate Waypoint
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT: AI PLANNER */}
          {selectedTab === 'ai_planner' && (
            <div className="space-y-4">
              <div className="bg-slate-950 border border-slate-850 rounded-xl p-3.5 flex items-start gap-2.5">
                <Bot className="w-5 h-5 text-cyan-400 shrink-0" />
                <div className="text-xs space-y-1">
                  <span className="font-bold text-cyan-400 block">Zeex-AI Planning Assistant</span>
                  <p className="text-slate-400 leading-relaxed">
                    "I have parsed the topography and weather. Estimated success score: 98%. Battery requirement verified."
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <button 
                  onClick={() => triggerAIPlanner('survey')}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-cyan-500/50 p-2.5 rounded-xl text-xs text-left transition-all flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <div>
                    <span className="font-bold text-slate-200 block text-[11px]">Generate Autonomous Survey</span>
                    <span className="text-[9px] text-slate-500 block">Creates optimized scan mapping grids.</span>
                  </div>
                </button>
                <button 
                  onClick={() => triggerAIPlanner('optimize')}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-cyan-500/50 p-2.5 rounded-xl text-xs text-left transition-all flex items-center gap-2"
                >
                  <Cpu className="w-4 h-4 text-purple-400" />
                  <div>
                    <span className="font-bold text-slate-200 block text-[11px]">Optimize Battery Efficiency</span>
                    <span className="text-[9px] text-slate-500 block">Adjusts waypoints to minimize drag.</span>
                  </div>
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Mission controls footer */}
        <div className="border-t border-slate-850 pt-4 mt-6 space-y-2">
          {!simulating ? (
            <button 
              onClick={() => {
                setSimStep(0);
                setSimulating(true);
              }}
              className="w-full bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-cyan-500/10"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Simulate Mission Path
            </button>
          ) : (
            <button 
              onClick={() => setSimulating(false)}
              className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
              Abort Simulation
            </button>
          )}

          <button 
            onClick={() => {
              // Add simulated flight/mission to flights database
              actions.addFlight({
                drone: activeMission.drone,
                pilot: 'Alex Rivera',
                destination: 'Downtown HQ Perimeter',
                payload: activeMission.name,
                status: 'In Progress'
              });
              alert(`Uploading flight plans to UAV drone ${activeMission.drone}... Initializing motors.`);
            }}
            className="w-full bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-slate-200 hover:text-white py-2.5 rounded-xl text-xs font-bold transition-all text-center block"
          >
            Upload & Launch Mission
          </button>
        </div>
      </div>

    </div>
  );
}
