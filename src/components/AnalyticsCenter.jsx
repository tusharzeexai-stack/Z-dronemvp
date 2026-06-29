import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Chart from 'chart.js/auto';
import { 
  Activity, Cpu, ShieldAlert, Layers, Compass, Eye, Video, 
  AlertTriangle, TrendingUp, Bot, Zap, BarChart3, Database,
  FileSpreadsheet, FileDown, Navigation, RefreshCw, Layers3,
  Gauge, Thermometer, Radio, Wind, Battery, Heart, Search, Filter,
  CheckCircle, Play, Maximize2, AlertCircle, Sliders, ChevronDown, Calendar,
  CloudSun, User, MapPin, Wifi, WifiOff, Users, Target, Crosshair
} from 'lucide-react';
import { useDetections } from '../hooks/useDetections';

// --- MOCK RAW INTELLIGENCE DATASETS ---
const MOCK_MISSIONS = [
  { id: 'MSN-2026-08A', name: 'IMT Kharkhoda Infrastructure Scan', drone: 'ZD-109', operator: 'Alex Rivera', location: 'Kharkhoda (Maruti Plant)', date: '2026-06-25', weather: 'Clear / Sunny', zone: 'Sector Alpha', status: 'Completed', duration: '42m 12s', distance: '12.4 km', coverage: '94.2%', speed: '12 m/s', altitude: '45 m', objects: 182, incidents: 2 },
  { id: 'MSN-2026-08B', name: 'Factory Traffic Surveillance', drone: 'ZD-088', operator: 'C. Nolan', location: 'Kharkhoda (Maruti Plant)', date: '2026-06-25', weather: 'High Winds', zone: 'Sector Beta', status: 'Completed', duration: '15m 08s', distance: '4.2 km', coverage: '88.5%', speed: '8 m/s', altitude: '15 m', objects: 94, incidents: 1 },
  { id: 'MSN-2026-08C', name: 'Assembly Hangar Thermal Check', drone: 'ZD-112', operator: 'S. Jobs', location: 'Industrial Sector 4', date: '2026-06-24', weather: 'Clear / Night', zone: 'Sector Gamma', status: 'Completed', duration: '28m 45s', distance: '8.1 km', coverage: '98.0%', speed: '10 m/s', altitude: '30 m', objects: 45, incidents: 0 },
  { id: 'MSN-2026-08D', name: 'East Boundary Pipeline Inspection', drone: 'ZD-055', operator: 'A. Miller', location: 'East Pipeline Corridor', date: '2026-06-23', weather: 'Overcast', zone: 'Sector Delta', status: 'Completed', duration: '34m 10s', distance: '10.5 km', coverage: '91.4%', speed: '14 m/s', altitude: '60 m', objects: 112, incidents: 4 }
];

const MOCK_DETECTIONS = [
  { id: 'DET-001', time: '10:42 AM', location: 'IMT Hangar Pad', object: 'Car', confidence: 98.4, coords: '28.8308, 76.9311', thumbnail: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=150&auto=format&fit=crop&q=60' },
  { id: 'DET-002', time: '10:45 AM', location: 'Sector B Intersection', object: 'Pedestrian', confidence: 91.2, coords: '28.8325, 76.9335', thumbnail: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=60' },
  { id: 'DET-003', time: '10:48 AM', location: 'Central Warehouse Area', object: 'Smoke Warning', confidence: 84.6, coords: '28.8340, 76.9358', thumbnail: 'https://images.unsplash.com/photo-1518173946687-a4c8a383392e?w=150&auto=format&fit=crop&q=60' },
  { id: 'DET-004', time: '10:52 AM', location: 'East Boundary Gate', object: 'Construction Crane', confidence: 89.1, coords: '28.8355, 76.9380', thumbnail: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=150&auto=format&fit=crop&q=60' },
  { id: 'DET-005', time: '10:55 AM', location: 'Factory Express Exit', object: 'Truck', confidence: 95.7, coords: '28.8375, 76.9395', thumbnail: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=150&auto=format&fit=crop&q=60' },
  { id: 'DET-006', time: '10:58 AM', location: 'Sector Alpha North', object: 'Fire Hazard', confidence: 92.4, coords: '28.8390, 76.9375', thumbnail: 'https://images.unsplash.com/photo-1508873696983-2df519f0397e?w=150&auto=format&fit=crop&q=60' }
];


export default function AnalyticsCenter({ appState, actions, getApiUrl }) {
  // ── Live Detection WebSocket ───────────────────────────────────
  const detectionApiBase = getApiUrl ? getApiUrl('') : (import.meta.env.VITE_API_URL || localStorage.getItem('z_drone_backend_url') || '');
  const { isConnected: wsConnected, latest, history: detHistory, stats: detStats } = useDetections(detectionApiBase);

  // ── STATE MANAGEMENT ───────────────────────────────────────
  const [selectedMissionId, setSelectedMissionId] = useState('MSN-2026-08A');
  const [filterDrone, setFilterDrone] = useState('all');
  const [filterOperator, setFilterOperator] = useState('all');
  const [filterLocation, setFilterLocation] = useState('all');
  const [filterWeather, setFilterWeather] = useState('all');
  const [filterZone, setFilterZone] = useState('all');
  const [filterConfidence, setFilterConfidence] = useState(70);
  const [searchQuery, setSearchQuery] = useState('');
  
  // GIS States
  const [satelliteView, setSatelliteView] = useState(false);
  const [heatmapType, setHeatmapType] = useState('vehicle'); // vehicle, crowd, fire
  
  // Mission Comparison States
  const [comparisonMissionA, setComparisonMissionA] = useState('MSN-2026-08A');
  const [comparisonMissionB, setComparisonMissionB] = useState('MSN-2026-08B');
  
  // Modal State for Gallery Card Click
  const [activeModalDetection, setActiveModalDetection] = useState(null);

  // Get active selected mission detail
  const activeMission = useMemo(() => {
    return MOCK_MISSIONS.find(m => m.id === selectedMissionId) || MOCK_MISSIONS[0];
  }, [selectedMissionId]);

  // Leaflet Map Refs
  const gisMapRef = useRef(null);
  const gisMapInstanceRef = useRef(null);
  const mapMarkersGroupRef = useRef(null);
  const mapHeatmapGroupRef = useRef(null);

  // ChartJS Refs
  const chart1Ref = useRef(null);
  const chart2Ref = useRef(null);
  const chart3Ref = useRef(null);
  const chart4Ref = useRef(null);

  const canvas1Ref = useRef(null);
  const canvas2Ref = useRef(null);
  const canvas3Ref = useRef(null);
  const canvas4Ref = useRef(null);

  // --- MAP & CHARTS RENDERING & SYNCHRONIZATION ---

  // Initialize and Sync GIS Leaflet Map
  useEffect(() => {
    if (!gisMapRef.current) return;

    // Destroy existing map instance to avoid multiple binds
    if (gisMapInstanceRef.current) {
      gisMapInstanceRef.current.remove();
      gisMapInstanceRef.current = null;
    }

    const map = L.map(gisMapRef.current, {
      center: [28.8308, 76.9311],
      zoom: 14,
      zoomControl: true,
      attributionControl: false
    });
    gisMapInstanceRef.current = map;

    // Apply layers based on satellite view selector
    const tileUrl = satelliteView 
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    
    L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);

    // Create Layer Groups
    mapMarkersGroupRef.current = L.layerGroup().addTo(map);
    mapHeatmapGroupRef.current = L.layerGroup().addTo(map);

    // Render Path & Boundaries
    const latlngs = [
      [28.8308, 76.9311],
      [28.8325, 76.9335],
      [28.8340, 76.9358],
      [28.8355, 76.9380],
      [28.8375, 76.9395],
      [28.8390, 76.9375],
      [28.8405, 76.9350],
      [28.8395, 76.9325],
      [28.8375, 76.9300],
      [28.8350, 76.9280],
      [28.8325, 76.9275],
      [28.8308, 76.9311]
    ];
    L.polyline(latlngs, { color: '#06b6d4', weight: 3, dashArray: '8, 8' }).addTo(map);
    L.polygon(latlngs, { color: '#06b6d4', fillColor: '#06b6d4', fillOpacity: 0.05 }).addTo(map);


    return () => {
      if (gisMapInstanceRef.current) {
        gisMapInstanceRef.current.remove();
        gisMapInstanceRef.current = null;
      }
    };
  }, [satelliteView]);

  // Handle markers & heatmaps dynamic rendering on selection update
  useEffect(() => {
    if (!gisMapInstanceRef.current || !mapMarkersGroupRef.current || !mapHeatmapGroupRef.current) return;

    // Clear old layers
    mapMarkersGroupRef.current.clearLayers();
    mapHeatmapGroupRef.current.clearLayers();

    // 1. Draw Simulated Heatmaps on the Map based on selection
    if (heatmapType === 'vehicle') {
      [[28.8325, 76.9335, 80], [28.8375, 76.9395, 90], [28.8340, 76.9358, 60]].forEach(([lat, lng, radius]) => {
        L.circle([lat, lng], { radius, color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.4, weight: 0 }).addTo(mapHeatmapGroupRef.current);
      });
    } else if (heatmapType === 'crowd') {
      [[28.8390, 76.9375, 120], [28.8308, 76.9311, 70]].forEach(([lat, lng, radius]) => {
        L.circle([lat, lng], { radius, color: '#a855f7', fillColor: '#a855f7', fillOpacity: 0.4, weight: 0 }).addTo(mapHeatmapGroupRef.current);
      });
    } else if (heatmapType === 'fire') {
      [[28.8390, 76.9375, 60], [28.8340, 76.9358, 50]].forEach(([lat, lng, radius]) => {
        L.circle([lat, lng], { radius, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.5, weight: 0 }).addTo(mapHeatmapGroupRef.current);
      });
    }


    // 2. Draw Detection Markers
    MOCK_DETECTIONS.forEach(det => {
      const [lat, lng] = det.coords.split(', ').map(Number);
      
      const isFire = det.object.toLowerCase().includes('fire');
      const isSmoke = det.object.toLowerCase().includes('smoke');
      const isPerson = det.object.toLowerCase().includes('pedestrian');

      const markerColor = isFire ? 'bg-red-500' : isSmoke ? 'bg-amber-500' : isPerson ? 'bg-purple-500' : 'bg-cyan-500';
      const markerIcon = isFire ? 'local_fire_department' : isSmoke ? 'detector_smoke' : isPerson ? 'directions_walk' : 'directions_car';

      const customHtmlIcon = L.divIcon({
        html: `
          <div class="relative flex items-center justify-center w-8 h-8">
              <div class="absolute inset-0 ${markerColor}/30 rounded-full animate-ping"></div>
              <div class="w-6 h-6 ${markerColor} rounded-full flex items-center justify-center shadow-lg text-slate-800 border border-white/20 z-10">
                  <span class="material-symbols-outlined text-[14px]">${markerIcon}</span>
              </div>
          </div>
        `,
        className: 'custom-det-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([lat, lng], { icon: customHtmlIcon }).addTo(mapMarkersGroupRef.current);
      marker.bindPopup(`
        <div class="p-2 text-slate-800 font-sans">
          <p class="font-bold text-xs">${det.object}</p>
          <p class="text-[10px] text-slate-500">${det.time} • Confidence: ${det.confidence}%</p>
          <p class="text-[10px] font-mono text-slate-400 mt-1">${det.coords}</p>
        </div>
      `);
    });

  }, [heatmapType]);

  // Render Charts with high contrast labels styled for light card panels
  useEffect(() => {
    const renderCharts = () => {
      // Read live/stored AI stats
      const storedStats = JSON.parse(localStorage.getItem('z_drone_ai_stats') || '{}');
      let totalPedsVal = storedStats.totalPeds !== undefined ? storedStats.totalPeds : 0;
      let totalHelmetsVal = storedStats.totalHelmets !== undefined ? storedStats.totalHelmets : 0;
      let totalVestsVal = storedStats.totalVests !== undefined ? storedStats.totalVests : 0;
      let totalCranesVal = storedStats.totalCranes !== undefined ? storedStats.totalCranes : 0;
      let totalBulldozersVal = storedStats.totalBulldozers !== undefined ? storedStats.totalBulldozers : 0;
      let totalConcreteMixersVal = storedStats.totalConcreteMixers !== undefined ? storedStats.totalConcreteMixers : 0;

      // Add a distinct baseline of dummy counts to ensure each bar always has a different height
      totalPedsVal += 32;
      totalHelmetsVal += 24;
      totalVestsVal += 19;
      totalCranesVal += 6;
      totalBulldozersVal += 11;
      totalConcreteMixersVal += 4;

      // 1. Chart 1: Vehicle Distribution Donut
      if (canvas1Ref.current) {
        if (chart1Ref.current) chart1Ref.current.destroy();
        chart1Ref.current = new Chart(canvas1Ref.current.getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: ['Cars', 'Motorcycles', 'Trucks', 'Buses'],
            datasets: [{
              data: [65, 15, 12, 8],
              backgroundColor: ['#38bdf8', '#60a5fa', '#c084fc', '#e879f9'],
              borderColor: '#ffffff',
              borderWidth: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'right', labels: { color: '#334155', font: { family: 'Inter', size: 11, weight: 'bold' } } }
            },
            cutout: '70%'
          }
        });
      }

      // 2. Chart 2: Category Detection Bar Chart
      if (canvas2Ref.current) {
        if (chart2Ref.current) chart2Ref.current.destroy();
        chart2Ref.current = new Chart(canvas2Ref.current.getContext('2d'), {
          type: 'bar',
          data: {
            labels: ['Persons', 'Helmets', 'Vests', 'Cranes', 'Bulldozers', 'Mixers'],
            datasets: [{
              label: 'Detected Counts',
              data: [totalPedsVal, totalHelmetsVal, totalVestsVal, totalCranesVal, totalBulldozersVal, totalConcreteMixersVal],
              backgroundColor: 'rgba(56, 189, 248, 0.85)',
              borderColor: '#0284c7',
              borderWidth: 1.5,
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false }, ticks: { color: '#475569', font: { weight: 'bold' } } },
              y: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#475569', font: { weight: 'bold' } } }
            }
          }
        });
      }

      // 3. Chart 3: Hourly Detection Frequency
      if (canvas3Ref.current) {
        if (chart3Ref.current) chart3Ref.current.destroy();
        chart3Ref.current = new Chart(canvas3Ref.current.getContext('2d'), {
          type: 'line',
          data: {
            labels: ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'],
            datasets: [{
              label: 'AI Inference Event Rate',
              data: [
                Math.round(totalPedsVal * 0.2 + 5),
                Math.round(totalHelmetsVal * 0.3 + 12),
                Math.round(totalVestsVal * 0.4 + 22),
                Math.round(totalCranesVal * 1.5 + 32),
                Math.round(totalBulldozersVal * 1.2 + 18),
                Math.round(totalConcreteMixersVal * 1.8 + 10)
              ],
              borderColor: '#0284c7',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              fill: true,
              tension: 0.4,
              borderWidth: 3,
              pointRadius: 5,
              pointBackgroundColor: '#0284c7'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#334155', font: { weight: 'bold' } } } },
            scales: {
              x: { grid: { display: false }, ticks: { color: '#475569', font: { weight: 'bold' } } },
              y: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#475569', font: { weight: 'bold' } } }
            }
          }
        });
      }

      // 4. Chart 4: Radar Zone Metric Comparison
      if (canvas4Ref.current) {
        if (chart4Ref.current) chart4Ref.current.destroy();
        chart4Ref.current = new Chart(canvas4Ref.current.getContext('2d'), {
          type: 'radar',
          data: {
            labels: ['Propulsion', 'Optical Performance', 'Link Signal', 'Sensory Hub', 'Structural Frame'],
            datasets: [
              {
                label: 'Sector Alpha',
                data: [98, 92, 95, 88, 94],
                borderColor: '#0284c7',
                backgroundColor: 'rgba(2, 132, 199, 0.2)',
                borderWidth: 2.5
              },
              {
                label: 'Sector Beta',
                data: [92, 85, 78, 80, 88],
                borderColor: '#60a5fa',
                backgroundColor: 'rgba(96, 165, 250, 0.15)',
                borderWidth: 2
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#334155', font: { weight: 'bold' } } } },
            scales: {
              r: {
                grid: { color: 'rgba(0,0,0,0.08)' },
                angleLines: { color: 'rgba(0,0,0,0.08)' },
                pointLabels: { color: '#334155', font: { size: 10, weight: 'bold' } },
                ticks: { display: false }
              }
            }
          }
        });
      }
    };

    renderCharts();

    // Set up a 1-second interval to pull active counts while playing a stream
    const intervalId = setInterval(renderCharts, 1000);

    return () => {
      clearInterval(intervalId);
      if (chart1Ref.current) chart1Ref.current.destroy();
      if (chart2Ref.current) chart2Ref.current.destroy();
      if (chart3Ref.current) chart3Ref.current.destroy();
      if (chart4Ref.current) chart4Ref.current.destroy();
    };
  }, []);

  // --- ACTIONS ---
  const handleExport = (type) => {
    alert(`Generating export package: ${type.toUpperCase()}.\nDownloading system files now...`);
  };

  const getDifferenceIndicator = (valA, valB, unit = '') => {
    const numA = parseFloat(valA);
    const numB = parseFloat(valB);
    const diff = numA - numB;
    if (isNaN(diff)) return <span className="text-slate-500">N/A</span>;
    if (diff === 0) return <span className="text-slate-800">Stable</span>;
    
    const formattedDiff = Math.abs(diff).toFixed(1);
    return diff > 0 ? (
      <span className="text-slate-800 font-black bg-white/20 px-2 py-0.5 rounded border border-white/25">+{formattedDiff}{unit}</span>
    ) : (
      <span className="text-slate-600 font-semibold bg-white/10 px-2 py-0.5 rounded border border-white/10">-{formattedDiff}{unit}</span>
    );
  };

  return (
    <div className="space-y-6 text-slate-800 font-sans pb-12">

      {/* ── LIVE JETSON AI FEED PANEL ── */}
      <div className={`rounded-2xl border-2 p-5 transition-all duration-500 ${
        wsConnected
          ? latest && latest.person_count > 0
            ? 'bg-red-50 border-red-300 shadow-lg shadow-red-100'
            : 'bg-emerald-50 border-emerald-300'
          : 'bg-slate-50 border-slate-200'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${
              wsConnected ? 'bg-emerald-500' : 'bg-slate-400'
            }`}>
              {wsConnected ? <Wifi className="w-4 h-4 text-white" /> : <WifiOff className="w-4 h-4 text-white" />}
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm">Jetson Live AI Feed</h3>
              <p className="text-[10px] text-slate-500 font-medium">
                {wsConnected ? 'Real-time detections via WebSocket' : 'Connecting to /ws/detections…'}
              </p>
            </div>
          </div>
          <div className={`flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wide ${
            wsConnected
              ? latest && latest.person_count > 0
                ? 'bg-red-500 text-white'
                : 'bg-emerald-500 text-white'
              : 'bg-slate-300 text-slate-600'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full bg-white/80 ${
              wsConnected ? 'animate-pulse' : ''
            }`} />
            {wsConnected
              ? latest && latest.person_count > 0 ? '⚠️ Alert — Person Detected' : 'Connected'
              : 'Offline'
            }
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
          {/* Live Person Count */}
          <div className={`rounded-xl p-4 flex flex-col justify-between col-span-1 sm:col-span-2 ${
            latest && latest.person_count > 0
              ? 'bg-red-500 text-white'
              : 'bg-white border border-slate-200'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Live Person Count</span>
            </div>
            <div className="text-5xl font-black leading-none">
              {wsConnected && latest ? latest.person_count : '—'}
            </div>
            <div className="text-[10px] mt-2 opacity-70">
              {wsConnected && latest
                ? `Frame #${latest.frame_id} • ${new Date(latest.timestamp).toLocaleTimeString()}`
                : 'No live data'}
            </div>
          </div>

          {/* FPS */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Inference FPS</span>
            </div>
            <div className="text-2xl font-black text-slate-800">
              {wsConnected && latest ? `${latest.fps.toFixed(1)}` : '—'}
            </div>
            <div className="text-[10px] text-slate-400">Jetson TensorRT</div>
          </div>

          {/* Total Events */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 mb-2">
              <BarChart3 className="w-4 h-4 text-sky-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total Events</span>
            </div>
            <div className="text-2xl font-black text-slate-800">
              {detStats.globalTotalEvents.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-400">This session</div>
          </div>

          {/* Total Persons */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 mb-2">
              <Target className="w-4 h-4 text-purple-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Persons Seen</span>
            </div>
            <div className="text-2xl font-black text-slate-800">
              {detStats.globalTotalPersons.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-400">Cumulative</div>
          </div>

          {/* Avg Confidence */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 mb-2">
              <Crosshair className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Avg Confidence</span>
            </div>
            <div className="text-2xl font-black text-slate-800">
              {detStats.confidenceStats.samples > 0
                ? `${(detStats.confidenceStats.avg * 100).toFixed(1)}%`
                : '—'}
            </div>
            <div className="text-[10px] text-slate-400">
              {detStats.confidenceStats.samples > 0
                ? `Range ${(detStats.confidenceStats.min * 100).toFixed(0)}–${(detStats.confidenceStats.max * 100).toFixed(0)}%`
                : 'No data yet'}
            </div>
          </div>
        </div>

        {/* Per-device stats + Real-time event feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Per-device breakdown */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h4 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" /> Camera Analytics
            </h4>
            {Object.keys(detStats.byDevice).length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                {wsConnected ? 'Waiting for first detection…' : 'WebSocket offline'}
              </p>
            ) : (
              <div className="space-y-3">
                {Object.entries(detStats.byDevice).map(([deviceId, d]) => (
                  <div key={deviceId} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-800">{deviceId}</span>
                      <span className="text-[10px] bg-sky-100 text-sky-700 font-bold px-1.5 py-0.5 rounded">
                        {d.avgFps} FPS
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-xs font-black text-slate-800">{d.totalEvents}</div>
                        <div className="text-[9px] text-slate-400">Events</div>
                      </div>
                      <div>
                        <div className="text-xs font-black text-slate-800">{d.totalPersons}</div>
                        <div className="text-[9px] text-slate-400">Persons</div>
                      </div>
                      <div>
                        <div className="text-xs font-black text-red-500">{d.peakCount}</div>
                        <div className="text-[9px] text-slate-400">Peak</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Real-time event feed */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 flex flex-col">
            <h4 className="text-xs font-bold text-slate-700 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Real-Time Event Feed
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                Last {Math.min(detHistory.length, 20)} of {detHistory.length} events
              </span>
            </h4>
            <div className="flex-1 overflow-y-auto max-h-52 space-y-1.5 pr-1">
              {detHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Activity className="w-6 h-6 text-slate-300" />
                  <p className="text-xs text-slate-400">
                    {wsConnected ? 'Waiting for events from Jetson…' : 'WebSocket disconnected'}
                  </p>
                </div>
              ) : (
                detHistory.slice(0, 20).map((evt, idx) => (
                  <div
                    key={`${evt.frame_id}-${idx}`}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition-all ${
                      evt.person_count > 0
                        ? 'bg-red-50 border border-red-200'
                        : 'bg-slate-50 border border-slate-100'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      evt.person_count > 0 ? 'bg-red-500 animate-pulse' : 'bg-slate-300'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-slate-700">{evt.device_id}</span>
                      <span className="text-slate-400 ml-1.5">
                        {evt.person_count > 0
                          ? `📊 ${evt.person_count} person${evt.person_count !== 1 ? 's' : ''} detected`
                          : 'No persons'}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] font-bold text-slate-600">{evt.fps?.toFixed(1)} fps</div>
                      <div className="text-[9px] text-slate-400">
                        {new Date(evt.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </div>
                    {evt.person_count > 0 && evt.detections?.length > 0 && (
                      <div className="text-[10px] text-red-500 font-bold shrink-0">
                        {(Math.max(...evt.detections.map(d => d.confidence)) * 100).toFixed(0)}%
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── STICKY CONTROL & FILTER PANEL ── */}
      <div className="sticky top-0 z-30 bg-white border border-slate-200 text-slate-800 rounded-2xl p-4 shadow-2xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search intelligence logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs w-48 focus:outline-none text-slate-800 placeholder-slate-400"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-800" />
            <select 
              value={selectedMissionId} 
              onChange={(e) => setSelectedMissionId(e.target.value)}
              className="bg-transparent border-none text-xs focus:ring-0 text-slate-800 focus:outline-none font-bold"
            >
              {MOCK_MISSIONS.map(m => (
                <option key={m.id} value={m.id} className="bg-white text-slate-800">{m.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <Cpu className="w-3.5 h-3.5 text-slate-800" />
            <select 
              value={filterDrone} 
              onChange={(e) => setFilterDrone(e.target.value)}
              className="bg-transparent border-none text-xs focus:ring-0 text-slate-800 focus:outline-none font-bold"
            >
              <option value="all" className="bg-white text-slate-800">All Drones</option>
              <option value="ZD-109" className="bg-white text-slate-800">ZD-109</option>
              <option value="ZD-088" className="bg-white text-slate-800">ZD-088</option>
              <option value="ZD-112" className="bg-white text-slate-800">ZD-112</option>
            </select>
          </div>
        </div>

        {/* EXPORT OPTIONS */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => handleExport('pdf')}
            className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 hover:bg-sky-500/40 text-slate-800 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow"
          >
            <FileDown className="w-3.5 h-3.5" />
            PDF
          </button>
          <button 
            onClick={() => handleExport('csv')}
            className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 hover:bg-sky-500/40 text-slate-800 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            CSV
          </button>
          <button 
            onClick={() => handleExport('report')}
            className="flex items-center gap-1.5 bg-white hover:bg-sky-100 text-sky-900 px-4 py-2 rounded-xl text-xs font-extrabold transition-all shadow-md"
          >
            <Layers className="w-3.5 h-3.5" />
            Mission Report
          </button>
        </div>
      </div>

      {/* ── 1. EXECUTIVE KPI CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Missions', value: '142', trend: '+12.4%', icon: Compass, color: 'text-slate-800' },
          { label: 'Active Drones', value: appState.drones.filter(d => d.status === 'Online').length, trend: 'Stable', icon: Cpu, color: 'text-slate-800' },
          { label: 'Flight Hours', value: '348.5h', trend: '+8.2h today', icon: Activity, color: 'text-slate-800' },
          { label: 'Area Surveyed', value: '1,240.2 km²', trend: '+18.1%', icon: Navigation, color: 'text-slate-800' },
          { label: 'Objects Detected', value: '24,982', trend: '+5.4% last run', icon: Eye, color: 'text-slate-800' },
          { label: 'AI Accuracy', value: '98.4%', trend: '+0.2%', icon: Bot, color: 'text-slate-800' },
          { label: 'Active Alerts', value: appState.alerts.filter(a => !a.resolved).length, trend: '-3 resolved', icon: ShieldAlert, color: 'text-slate-800' },
          { label: 'Avg Battery Health', value: '94.2%', trend: 'Optimum', icon: Battery, color: 'text-slate-800' },
        ].map((kpi, idx) => (
          <div 
            key={idx} 
            className="bg-white border border-slate-200 text-slate-800 hover:border-white/50 rounded-2xl p-5 flex items-center justify-between transition-all duration-300 transform hover:-translate-y-1 shadow-xl"
          >
            <div className="space-y-1 text-left">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">{kpi.label}</span>
              <h3 className="text-2xl font-black text-slate-800">{kpi.value}</h3>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-800 font-bold bg-white/20 border border-white/25 px-1.5 py-0.5 rounded">{kpi.trend}</span>
                <span className="text-[9px] text-sky-250">Updated 2m ago</span>
              </div>
            </div>
            <div className={`p-3 bg-slate-50 border border-slate-200 rounded-xl ${kpi.color}`}>
              <kpi.icon className="w-6 h-6" />
            </div>
          </div>
        ))}
      </div>

      {/* ── 2. AI MISSION SUMMARY & COCKPIT ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Mission Details Spec Sheet */}
        <div className="lg:col-span-2 bg-white border border-slate-200 text-slate-800 rounded-2xl p-6 text-left flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{activeMission.id}</span>
                <h3 className="text-lg font-black text-slate-800 mt-1">{activeMission.name}</h3>
              </div>
              <span className="px-3 py-1 bg-white/20 text-slate-800 border border-white/30 text-xs font-bold rounded-full">
                {activeMission.status}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              {[
                { label: 'Operator', val: activeMission.operator },
                { label: 'Duration', val: activeMission.duration },
                { label: 'Distance Covered', val: activeMission.distance },
                { label: 'GIS Area Coverage', val: activeMission.coverage },
                { label: 'Average Velocity', val: activeMission.speed },
                { label: 'Max Altitude', val: activeMission.altitude },
                { label: 'Objects Identified', val: activeMission.objects },
                { label: 'Thermal Incidents', val: activeMission.incidents }
              ].map((item, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                  <span className="text-[10px] text-slate-500 font-semibold block">{item.label}</span>
                  <span className="text-sm font-black text-slate-800 mt-1 block">{item.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AI assistant insight response block */}
          <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
            <div className="p-2 bg-white/20 text-slate-800 rounded-lg">
              <Bot className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-800">Zeex-AI Co-Pilot Integration</span>
              <p className="text-xs text-sky-100 leading-relaxed">
                "Active drone analytics for Sector Alpha processed. Traffic volumes are elevated by 18% near coordinates [28.8308, 76.9311]. Anomalous thermal signature detected in warehouse zone Sector B — recommend deploying target mission check immediately."
              </p>

            </div>
          </div>
        </div>

        {/* AI Insight Chat & Prompt Card */}
        <div className="bg-white border border-slate-200 text-slate-800 rounded-2xl p-6 text-left flex flex-col justify-between shadow-xl">
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-sky-400/40 pb-3">
              <Bot className="w-5 h-5 text-slate-800" />
              <h3 className="font-bold text-sm text-slate-800">AI Intelligence Recommendations</h3>
            </div>
            
            <div className="space-y-2.5">
              {[
                { title: 'Traffic volume spike in East corridor', desc: 'Auto-rerouting secondary surveillance ZD-088.', level: 'medium' },
                { title: 'Potential obstruction on Hospital Pad', desc: 'Deploying optical verification sequence.', level: 'high' },
                { title: 'Anomalous heat index near East corridor', desc: 'Triggering incident logger Z-Notify.', level: 'high' }
              ].map((rec, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-start gap-2.5">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    rec.level === 'high' ? 'bg-rose-400 animate-pulse' : 'bg-amber-400'
                  }`}></span>
                  <div className="text-xs space-y-0.5">
                    <p className="font-bold text-slate-800">{rec.title}</p>
                    <p className="text-[10px] text-sky-100">{rec.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <button className="w-full bg-white hover:bg-sky-100 text-sky-900 font-extrabold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 mt-4 transition-colors shadow">
            <Play className="w-3.5 h-3.5 fill-current" />
            Trigger Recommendation Queue
          </button>
        </div>
      </div>

      {/* ── 3. LIVE DETECTION ANALYTICS (GRID OF NEON CARD LABELS) ── */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-extrabold uppercase tracking-widest text-sky-900 dark:text-slate-500 text-left">Live Detection AI Index</h3>
          <span className="flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-300">
            <span className="w-2 h-2 bg-sky-500 rounded-full animate-ping"></span>
            Live Monitoring Stream Active
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[
            { name: 'Sedan Cars', count: 182, confidence: 98, trend: '+14%' },
            { name: 'Motorcycles', count: 24, confidence: 92, trend: '-2%' },
            { name: 'Cargo Trucks', count: 38, confidence: 95, trend: '+8%' },
            { name: 'Transit Buses', count: 12, confidence: 97, trend: 'Stable' },
            { name: 'Pedestrians', count: 142, confidence: 89, trend: '+22%' },
            { name: 'Animals', count: 3, confidence: 78, trend: '0%' },
            { name: 'Active Fire', count: 0, confidence: 99, trend: 'No alerts' },
            { name: 'Industrial Smoke', count: 2, confidence: 84, trend: 'Triggered' },
            { name: 'Excavators', count: 4, confidence: 91, trend: '+1%' },
            { name: 'Tower Cranes', count: 8, confidence: 96, trend: 'Stable' },
            { name: 'Road Damage', count: 1, confidence: 82, trend: 'Logged' },
            { name: 'Construction Sites', count: 3, confidence: 94, trend: '+2%' }
          ].map((item, idx) => (
            <div key={idx} className="bg-white border border-slate-200 text-slate-800 rounded-2xl p-4 text-left flex flex-col justify-between hover:border-white/50 transition-all shadow-xl">
              <span className="text-[10px] text-slate-500 font-bold uppercase">{item.name}</span>
              <div className="my-3 flex items-baseline justify-between">
                <span className="text-xl font-black text-slate-800">{item.count}</span>
                <span className="text-[10px] text-slate-800 bg-white/20 border border-white/20 px-1.5 py-0.5 rounded">{item.trend}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] border-t border-sky-400/40 pt-2 text-sky-150">
                <span>Confidence:</span>
                <span className="font-bold text-slate-800">{item.confidence}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 4. GIS ANALYTICS COMMAND CENTER ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Leaflet map frame */}
        <div className="lg:col-span-3 bg-white border border-slate-200 text-slate-800 rounded-2xl p-4 flex flex-col h-[550px] relative overflow-hidden shadow-xl">
          <header className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-sm text-slate-800 text-left flex items-center gap-1.5">
              <Layers3 className="w-4 h-4 text-slate-800" />
              GIS Tactical Operations Map
            </h3>
            
            <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200">
              <button 
                onClick={() => setSatelliteView(false)}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all ${
                  !satelliteView ? 'bg-white text-sky-900 shadow' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Vector Dark
              </button>
              <button 
                onClick={() => setSatelliteView(true)}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all ${
                  satelliteView ? 'bg-white text-sky-900 shadow' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Satellite Imagery
              </button>
            </div>
          </header>

          {/* Leaflet Map Div */}
          <div ref={gisMapRef} className="flex-1 rounded-xl overflow-hidden z-10 border border-sky-400/50" />

          {/* GIS Legend / HUD layer */}
          <div className="absolute bottom-6 left-6 z-20 bg-sky-950/95 border border-sky-400/60 rounded-xl p-3.5 text-xs text-left shadow-2xl space-y-2">
            <p className="font-bold border-b border-sky-400/40 pb-1.5 text-white">GIS Layer Legend</p>
            <div className="space-y-1 text-white font-medium">
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-cyan-500"></span>Vehicles</div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>Pedestrians</div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>Fire Hazard</div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>Smoke Incident</div>
            </div>
          </div>
        </div>

        {/* Heatmap Control Sidebar */}
        <div className="bg-white border border-slate-200 text-slate-800 rounded-2xl p-6 text-left flex flex-col justify-between shadow-xl">
          <div className="space-y-6">
            <div>
              <h4 className="font-bold text-sm text-slate-800 mb-2">GIS Density Heatmap</h4>
              <p className="text-xs text-slate-500">Overlay dynamic detection density models onto the spatial coordinates path.</p>
            </div>

            <div className="space-y-3">
              {[
                { id: 'vehicle', label: 'Vehicle Density Index', color: 'border-l-4 border-l-blue-500', desc: 'Focuses on vehicle congestion.' },
                { id: 'crowd', label: 'Crowd Gathering Risk', color: 'border-l-4 border-l-purple-500', desc: 'High density pedestrian areas.' },
                { id: 'fire', label: 'Thermal Fire Risk', color: 'border-l-4 border-l-red-550', desc: 'Infrared heat spike signatures.' }
              ].map(layer => (
                <button
                  key={layer.id}
                  onClick={() => setHeatmapType(layer.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                    heatmapType === layer.id 
                      ? 'bg-white border-white text-sky-900 shadow-xl' 
                      : 'bg-white/40 border-sky-500 hover:bg-sky-800/45'
                  } ${layer.color}`}
                >
                  <p className={`font-bold text-xs ${heatmapType === layer.id ? 'text-sky-900' : 'text-slate-800'}`}>{layer.label}</p>
                  <p className={`text-[10px] mt-0.5 ${heatmapType === layer.id ? 'text-sky-700' : 'text-slate-500'}`}>{layer.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-sky-400/40 pt-4 mt-6 text-xs text-slate-500 space-y-2">
            <div className="flex justify-between"><span>Coordinate Center:</span><span className="font-mono text-slate-800">28.8308, 76.9311</span></div>
            <div className="flex justify-between"><span>Tracking Nodes:</span><span className="font-bold text-slate-800">12 Waypoints</span></div>
            <div className="flex justify-between"><span>Mission Perimeter:</span><span className="font-bold text-slate-800">1.4 km²</span></div>
          </div>

        </div>
      </div>

      {/* ── 5. DETAILED ANALYTICS CHARTJS GRAPHS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 text-slate-800 rounded-2xl p-6 text-left shadow-xl">
          <div className="flex items-center gap-2 border-b border-sky-400/40 pb-3 mb-4">
            <BarChart3 className="w-4 h-4 text-slate-800" />
            <h4 className="font-bold text-sm text-slate-800">Object Detections Category Distribution</h4>
          </div>
          <div className="h-64">
            <canvas ref={canvas2Ref} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 text-slate-800 rounded-2xl p-6 text-left shadow-xl">
          <div className="flex items-center gap-2 border-b border-sky-400/40 pb-3 mb-4">
            <TrendingUp className="w-4 h-4 text-slate-800" />
            <h4 className="font-bold text-sm text-slate-800">Hourly AI Inference Detection Rates</h4>
          </div>
          <div className="h-64">
            <canvas ref={canvas3Ref} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 text-slate-800 rounded-2xl p-6 text-left shadow-xl">
          <div className="flex items-center gap-2 border-b border-sky-400/40 pb-3 mb-4">
            <Database className="w-4 h-4 text-slate-800" />
            <h4 className="font-bold text-sm text-slate-800">Vehicle Class Ratio Breakdown</h4>
          </div>
          <div className="h-64">
            <canvas ref={canvas1Ref} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 text-slate-800 rounded-2xl p-6 text-left shadow-xl">
          <div className="flex items-center gap-2 border-b border-sky-400/40 pb-3 mb-4">
            <Compass className="w-4 h-4 text-slate-800" />
            <h4 className="font-bold text-sm text-slate-800">Performance Metrics by Sector Zone</h4>
          </div>
          <div className="h-64">
            <canvas ref={canvas4Ref} />
          </div>
        </div>
      </div>

      {/* ── 6. TIMELINE & 7. FLIGHT PERFORMANCE ANALYTICS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline Log */}
        <div className="lg:col-span-2 bg-white border border-slate-200 text-slate-800 rounded-2xl p-6 text-left shadow-xl">
          <div className="flex items-center gap-2 border-b border-sky-400/40 pb-3 mb-4">
            <Activity className="w-4 h-4 text-slate-800" />
            <h4 className="font-bold text-sm text-slate-800">Chronological Detection Timeline</h4>
          </div>

          <div className="space-y-4 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[2px] before:bg-sky-400/40">
            {MOCK_DETECTIONS.map((det, idx) => (
              <div key={idx} className="flex gap-4 relative pl-8 group">
                <span className="absolute left-1.5 top-2.5 w-3 h-3 bg-white rounded-full border-2 border-sky-600 z-10 group-hover:scale-125 transition-transform" />
                <img 
                  src={det.thumbnail} 
                  alt={det.object} 
                  className="w-12 h-12 rounded-lg object-cover border border-sky-400/50"
                />
                <div className="flex-1 flex justify-between items-center">
                  <div className="space-y-0.5 text-xs">
                    <p className="font-bold text-slate-800">{det.object} Identified</p>
                    <p className="text-[10px] text-slate-500">{det.time} • Coords: {det.coords}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-slate-800 bg-white/20 border border-white/20 px-1.5 py-0.5 rounded">
                      {det.confidence}%
                    </span>
                    <button 
                      onClick={() => setActiveModalDetection(det)}
                      className="bg-white/40 border border-sky-400 hover:bg-sky-500/40 text-slate-800 text-[10px] px-2.5 py-1 rounded-lg font-bold transition-all shadow"
                    >
                      Inspect
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Flight Performance health stats */}
        <div className="bg-white border border-slate-200 text-slate-800 rounded-2xl p-6 text-left flex flex-col justify-between shadow-xl">
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-sky-400/40 pb-3">
              <Activity className="w-5 h-5 text-slate-800" />
              <h3 className="font-bold text-sm text-slate-800">Hardware Telemetry Health</h3>
            </div>

            <div className="space-y-4">
              {[
                { label: 'Propulsion Motors', val: 98, icon: Gauge, color: 'text-slate-800' },
                { label: 'Core Temp', val: 42, icon: Thermometer, color: 'text-slate-800', unit: '°C' },
                { label: 'Signal strength link', val: 95, icon: Radio, color: 'text-slate-800' },
                { label: 'Wind Resistance Factor', val: 14, icon: Wind, color: 'text-slate-800', unit: ' km/h' }
              ].map((stat, idx) => (
                <div key={idx} className="bg-white/40 border border-sky-450 p-3.5 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 bg-sky-950/40 border border-sky-400/40 rounded-lg ${stat.color}`}>
                      <stat.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-semibold">{stat.label}</p>
                      <p className="text-xs font-black text-slate-800 mt-0.5">{stat.val}{stat.unit || '%'}</p>
                    </div>
                  </div>
                  <div className="w-16 bg-sky-950/50 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={`h-full ${
                        stat.val > 80 ? 'bg-emerald-400' : stat.val > 50 ? 'bg-cyan-400' : 'bg-rose-455'
                      }`}
                      style={{ width: `${stat.val}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-sky-400/40 pt-4 mt-6 flex justify-between items-center text-xs">
            <span className="text-slate-500">Autonomous Calibration Check:</span>
            <span className="font-black text-slate-800 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Passed
            </span>
          </div>
        </div>
      </div>

      {/* ── 9. MISSION COMPARISON ── */}
      <div className="bg-white border border-slate-200 text-slate-800 rounded-2xl p-6 text-left shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-sky-400/40 pb-3 mb-6">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-slate-800" />
            <h4 className="font-bold text-sm text-slate-800">Mission Performance Comparison</h4>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white/40 px-3 py-1.5 rounded-xl border border-sky-400">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Mission A</span>
              <select 
                value={comparisonMissionA}
                onChange={(e) => setComparisonMissionA(e.target.value)}
                className="bg-transparent border-none text-xs text-slate-800 font-black focus:outline-none"
              >
                {MOCK_MISSIONS.map(m => (
                  <option key={m.id} value={m.id} className="bg-sky-800 text-slate-800">{m.id} - {m.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-white/40 px-3 py-1.5 rounded-xl border border-sky-400">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Mission B</span>
              <select 
                value={comparisonMissionB}
                onChange={(e) => setComparisonMissionB(e.target.value)}
                className="bg-transparent border-none text-xs text-slate-800 font-black focus:outline-none"
              >
                {MOCK_MISSIONS.map(m => (
                  <option key={m.id} value={m.id} className="bg-sky-800 text-slate-800">{m.id} - {m.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Comparison Details Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-sky-400/40 text-slate-500">
                <th className="py-2.5">Metrics Spec</th>
                <th className="py-2.5">Mission A</th>
                <th className="py-2.5">Mission B</th>
                <th className="py-2.5 text-right">Delta / Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-400/20">
              {[
                { label: 'Distance Traveled', key: 'distance', unit: ' km' },
                { label: 'Area Coverage', key: 'coverage', unit: '%' },
                { label: 'Average Speed', key: 'speed', unit: ' m/s' },
                { label: 'Max Altitude reached', key: 'altitude', unit: ' m' },
                { label: 'AI Detections', key: 'objects', unit: '' },
                { label: 'Critical Incidents', key: 'incidents', unit: '' }
              ].map((row, idx) => {
                const misA = MOCK_MISSIONS.find(m => m.id === comparisonMissionA) || MOCK_MISSIONS[0];
                const misB = MOCK_MISSIONS.find(m => m.id === comparisonMissionB) || MOCK_MISSIONS[1];

                const valA = misA[row.key];
                const valB = misB[row.key];

                return (
                  <tr key={idx} className="hover:bg-white/5">
                    <td className="py-3 font-semibold text-slate-500">{row.label}</td>
                    <td className="py-3 font-bold text-slate-800">{valA}</td>
                    <td className="py-3 font-bold text-slate-800">{valB}</td>
                    <td className="py-3 text-right font-mono">
                      {getDifferenceIndicator(valA, valB, row.unit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 10. FLEET ANALYTICS & DRONE STATUS ── */}
      <div>
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-sky-900 dark:text-slate-500 text-left mb-4">
          Fleet Aircraft Performance Indices
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {appState.drones.map((drone, idx) => (
            <div key={idx} className="bg-white border border-slate-200 text-slate-800 rounded-2xl p-5 text-left flex flex-col justify-between hover:border-white/50 transition-all shadow-xl">
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-sky-400/40 pb-2.5">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold">{drone.type}</span>
                    <h4 className="font-extrabold text-sm text-slate-800 mt-0.5">{drone.id}</h4>
                  </div>
                  <span className="px-2.5 py-0.5 rounded text-[9px] font-bold bg-white/20 text-slate-800 border border-white/25">
                    {drone.status}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-slate-500">Drone Model:</span><span className="font-bold text-slate-800">{drone.model}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Battery Level:</span><span className="font-bold text-slate-800">{drone.battery}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Signal strength link:</span><span className="font-bold text-slate-800">{drone.signal}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Pilot In Command:</span><span className="font-bold text-slate-800">{drone.operator}</span></div>
                </div>
              </div>

              <div className="mt-4 pt-3.5 border-t border-sky-400/40 flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                  <Heart className="w-3.5 h-3.5 text-rose-350" />
                  Health Score
                </div>
                <span className="text-xs font-black text-slate-800">98% Optimum</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 11. PINTEREST-STYLE DETECTION GALLERY ── */}
      <div>
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-sky-900 dark:text-slate-500 text-left mb-4">
          Spatial Inference Capture Gallery
        </h3>

        <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6">
          {MOCK_DETECTIONS.map((det, idx) => (
            <div 
              key={idx} 
              onClick={() => setActiveModalDetection(det)}
              className="break-inside-avoid bg-white border border-slate-200 text-slate-800 rounded-2xl overflow-hidden text-left cursor-pointer hover:border-white/50 transition-all shadow-xl group"
            >
              <div className="relative">
                <img 
                  src={det.thumbnail} 
                  alt={det.object} 
                  className="w-full object-cover max-h-60 group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-4 border-2 border-dashed border-sky-400 pointer-events-none flex items-start justify-start p-1 bg-white/5">
                  <span className="bg-white text-sky-900 text-[8px] font-bold px-1 rounded uppercase tracking-wider shadow">
                    {det.object} {det.confidence}%
                  </span>
                </div>
              </div>

              <div className="p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-xs text-slate-800">{det.object} Identified</h4>
                  <span className="text-[10px] text-slate-500">{det.time}</span>
                </div>
                <p className="text-[10px] text-sky-100 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-800" />
                  {det.location}
                </p>
                <div className="flex justify-between items-center text-[9px] text-slate-500 border-t border-sky-400/40 pt-2 font-mono">
                  <span>GPS: {det.coords}</span>
                  <span className="text-slate-800 font-sans font-bold">Inspect details →</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 12. PREDICTIVE ANALYTICS CARD BOARD ── */}
      <div>
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-sky-900 dark:text-slate-500 text-left mb-4">
          AI Predictive Intelligence Logs
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { title: 'Expected Traffic Volume Peak', desc: 'Predicting a 24% increase in vehicle congestion near Hospital Pad between 17:00 and 18:30 due to local shifts.', level: 87, color: 'text-slate-800' },
            { title: 'Elevated High Wind Risk Alert', desc: 'Weather modeling forecasts crosswinds exceeding 32km/h between 14:00 - 15:30. Recommend grounding lightweight drones.', level: 92, color: 'text-slate-800' },
            { title: 'Crowd Accumulation Indicator', desc: 'Socio-spatial analysis indicates a high probability (81%) of crowd gathers near Central Warehouse Sector during shifts.', level: 81, color: 'text-slate-800' }
          ].map((pred, idx) => (
            <div key={idx} className="bg-white border border-slate-200 text-slate-800 rounded-2xl p-5 text-left flex flex-col justify-between hover:border-white/50 transition-all shadow-xl">
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-sky-400/40 pb-2">
                  <Bot className={`w-4 h-4 ${pred.color}`} />
                  <h4 className="font-bold text-xs text-slate-800">{pred.title}</h4>
                </div>
                <p className="text-xs text-sky-100 leading-relaxed">{pred.desc}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-sky-400/40 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Prediction Confidence</span>
                <span className="text-xs font-black text-slate-800">{pred.level}% Probability</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── DETAIL MODAL DETECTIONS INSPECTION ── */}
      {activeModalDetection && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 text-slate-800 rounded-2xl w-full max-w-2xl min-w-[280px] sm:min-w-[500px] md:min-w-[650px] shrink-0 shadow-2xl overflow-hidden text-left flex flex-col md:flex-row">
            
            {/* Modal Image Block */}
            <div className="w-full md:w-1/2 relative bg-sky-950 flex items-center justify-center border-b md:border-b-0 md:border-r border-sky-500/50 min-h-[220px]">
              <img 
                src={activeModalDetection.thumbnail} 
                alt={activeModalDetection.object} 
                className="w-full h-full object-contain max-h-[350px]"
              />
              <div className="absolute inset-4 border-2 border-sky-400 flex items-start justify-start p-1 pointer-events-none">
                <span className="bg-white text-sky-900 text-[8px] font-bold px-1 rounded uppercase">
                  {activeModalDetection.object} {activeModalDetection.confidence}%
                </span>
              </div>
            </div>

            {/* Modal Specs Content */}
            <div className="w-full md:w-1/2 p-6 flex flex-col justify-between">
              <div className="space-y-4">
                <header className="flex justify-between items-start border-b border-sky-400/40 pb-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{activeModalDetection.id}</span>
                    <h3 className="text-base font-extrabold text-slate-800 mt-0.5">{activeModalDetection.object} Identified</h3>
                  </div>
                  <button 
                    onClick={() => setActiveModalDetection(null)}
                    className="text-slate-600 hover:text-slate-800"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                </header>

                <div className="space-y-2.5 text-xs text-sky-100">
                  <div className="flex justify-between"><span className="text-slate-500">Sensor Class:</span><span className="font-semibold text-slate-800">{activeModalDetection.object}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Confidence Match:</span><span className="font-bold text-slate-800">{activeModalDetection.confidence}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Detection Coords:</span><span className="font-mono text-slate-800">{activeModalDetection.coords}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Capture Time:</span><span className="font-semibold text-slate-800">{activeModalDetection.time}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Sector Region:</span><span className="font-semibold text-slate-800">{activeModalDetection.location}</span></div>
                </div>
              </div>

              <div className="border-t border-sky-400/40 pt-4 mt-6 flex gap-2">
                <button 
                  onClick={() => setActiveModalDetection(null)}
                  className="flex-1 bg-slate-50 border border-slate-200 hover:bg-sky-500/40 text-slate-800 py-2.5 rounded-xl text-xs font-bold transition-all text-center"
                >
                  Close Detail
                </button>
                <button 
                  onClick={() => {
                    alert(`Flagging incident ${activeModalDetection.id} to Z-Notify HPNS server...`);
                    setActiveModalDetection(null);
                  }}
                  className="flex-1 bg-white hover:bg-sky-100 text-sky-900 py-2.5 rounded-xl text-xs font-extrabold transition-all text-center shadow"
                >
                  Flag Incident
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}




