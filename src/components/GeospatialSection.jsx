import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Chart from 'chart.js/auto';

// Custom orthomosaic overlay coordinates
const SURVEY_BOUNDS = [
  [28.8310, 76.9290], // Southwest
  [28.8400, 76.9380]  // Northeast
];

const DEFAULT_PROJECTS = [
  { id: 'PROJ-001', name: 'Kharkhoda Plant Boundary Survey', area: '1.24 sq km', gsd: '1.8 cm/px', sensor: 'DJI Zenmuse P1 (RGB)', date: '2026-07-01', status: 'Processed' },
  { id: 'PROJ-002', name: 'Sector Delta Elevation Mapping', area: '0.85 sq km', gsd: '2.1 cm/px', sensor: 'Sony RX1R II (RGB)', date: '2026-07-05', status: 'Processed' },
  { id: 'PROJ-003', name: 'Scaffold Area Thermal Overlay', area: '0.32 sq km', gsd: '5.5 cm/px', sensor: 'FLIR Vue Pro R (Thermal)', date: '2026-07-08', status: 'Completed' }
];

function GeospatialSection() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const chartCanvasRef = useRef(null);
  const chartInstanceRef = useRef(null);

  // States
  const [layers, setLayers] = useState({
    ortho: true,
    dsm: false,
    boundary: true,
    nofly: true
  });
  const [projects, setProjects] = useState(DEFAULT_PROJECTS);
  const [selectedProject, setSelectedProject] = useState('PROJ-001');
  const [inputLat, setInputLat] = useState('28.8350');
  const [inputLng, setInputLng] = useState('76.9330');
  const [utmResult, setUtmResult] = useState({ zone: '43N', easting: '688432.1', northing: '3191142.5' });
  const [rulerPoints, setRulerPoints] = useState([]);
  const [distanceInfo, setDistanceInfo] = useState({ distance: 0, bearing: 0, time: 0 });
  const [uploadName, setUploadName] = useState('');
  const [uploadFile, setUploadFile] = useState(null);

  // Map layers refs
  const orthoOverlayRef = useRef(null);
  const dsmOverlayRef = useRef(null);
  const boundaryPolygonRef = useRef(null);
  const noflyCirclesRef = useRef([]);
  const rulerMarkersRef = useRef([]);
  const rulerPolylineRef = useRef(null);

  // Setup Leaflet map
  useEffect(() => {
    if (!mapRef.current) return;

    // Initialize map
    const map = L.map(mapRef.current, {
      center: [28.8355, 76.9335],
      zoom: 15,
      zoomControl: false,
      attributionControl: false
    });
    mapInstanceRef.current = map;

    // Tile Layer setup
    const isDark = document.documentElement.classList.contains('dark');
    const tileUrl = isDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);

    // 1. Survey boundary polygon
    const surveyCoords = [
      [28.8310, 76.9290],
      [28.8390, 76.9290],
      [28.8400, 76.9380],
      [28.8320, 76.9380],
      [28.8310, 76.9290]
    ];
    boundaryPolygonRef.current = L.polygon(surveyCoords, {
      color: '#0ea5e9',
      weight: 2,
      fillColor: '#0ea5e9',
      fillOpacity: 0.05
    });

    if (layers.boundary) {
      boundaryPolygonRef.current.addTo(map);
    }

    // 2. Custom SVG Orthomosaic Overlay
    const orthoSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    orthoSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    orthoSvg.setAttribute('viewBox', '0 0 100 100');
    orthoSvg.innerHTML = `
      <rect width="100" height="100" fill="#34d399" fill-opacity="0.15" stroke="#10b981" stroke-width="2" stroke-dasharray="4"/>
      <circle cx="30" cy="40" r="15" fill="#059669" fill-opacity="0.25"/>
      <circle cx="70" cy="60" r="20" fill="#047857" fill-opacity="0.25"/>
      <path d="M10,80 L40,50 L70,80" fill="none" stroke="#059669" stroke-width="1"/>
    `;
    orthoOverlayRef.current = L.svgOverlay(orthoSvg, SURVEY_BOUNDS, { opacity: 0.85, interactive: true });
    
    if (layers.ortho) {
      orthoOverlayRef.current.addTo(map);
    }

    // 3. Custom SVG DSM Overlay (Digital Surface Model Elevation Map)
    const dsmSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    dsmSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    dsmSvg.setAttribute('viewBox', '0 0 100 100');
    dsmSvg.innerHTML = `
      <defs>
        <radialGradient id="elev" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ef4444" stop-opacity="0.6"/>
          <stop offset="35%" stop-color="#f59e0b" stop-opacity="0.5"/>
          <stop offset="70%" stop-color="#10b981" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.3"/>
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill="url(#elev)"/>
    `;
    dsmOverlayRef.current = L.svgOverlay(dsmSvg, SURVEY_BOUNDS, { opacity: 0.75, interactive: true });

    if (layers.dsm) {
      dsmOverlayRef.current.addTo(map);
    }

    // 4. No-Fly Zones
    const noFlyCenters = [
      { lat: 28.8385, lng: 76.9315, name: "Telecom Mast Sector A", radius: 120 },
      { lat: 28.8330, lng: 76.9360, name: "Industrial Stack Area B", radius: 150 }
    ];

    noflyCirclesRef.current = noFlyCenters.map(zone => {
      return L.circle([zone.lat, zone.lng], {
        radius: zone.radius,
        color: '#ef4444',
        weight: 1.5,
        fillColor: '#ef4444',
        fillOpacity: 0.15
      }).bindTooltip(zone.name, { permanent: false, direction: 'center' });
    });

    if (layers.nofly) {
      noflyCirclesRef.current.forEach(c => c.addTo(map));
    }

    // Double-click listener on map to add ruler measurement points
    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      
      // Update coordinates converter inputs
      setInputLat(lat.toFixed(6));
      setInputLng(lng.toFixed(6));
      convertWgs84ToUtm(lat, lng);

      // Add to ruler points
      setRulerPoints(prev => {
        const next = [...prev, [lat, lng]];
        if (next.length > 2) {
          // Keep only last two points
          return next.slice(-2);
        }
        return next;
      });
    });

    return () => {
      map.remove();
    };
  }, []);

  // Update map overlays on layer state change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (layers.boundary) {
      boundaryPolygonRef.current.addTo(map);
    } else {
      boundaryPolygonRef.current.remove();
    }

    if (layers.ortho) {
      orthoOverlayRef.current.addTo(map);
    } else {
      orthoOverlayRef.current.remove();
    }

    if (layers.dsm) {
      dsmOverlayRef.current.addTo(map);
    } else {
      dsmOverlayRef.current.remove();
    }

    if (layers.nofly) {
      noflyCirclesRef.current.forEach(c => c.addTo(map));
    } else {
      noflyCirclesRef.current.forEach(c => c.remove());
    }
  }, [layers]);

  // Update ruler visual overlays when points change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear old ruler markers
    rulerMarkersRef.current.forEach(m => m.remove());
    rulerMarkersRef.current = [];

    if (rulerPolylineRef.current) {
      rulerPolylineRef.current.remove();
      rulerPolylineRef.current = null;
    }

    if (rulerPoints.length === 0) {
      setDistanceInfo({ distance: 0, bearing: 0, time: 0 });
      return;
    }

    // Add new markers
    rulerPoints.forEach((pt, idx) => {
      const isStart = idx === 0;
      const markerIcon = L.divIcon({
        html: `<div class="w-6 h-6 flex items-center justify-center rounded-full border-2 border-slate-800 dark:border-white shadow-md text-[10px] font-bold text-white ${isStart ? 'bg-sky-500' : 'bg-emerald-500'}">${isStart ? 'A' : 'B'}</div>`,
        className: 'custom-ruler-icon',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker(pt, { icon: markerIcon }).addTo(map);
      rulerMarkersRef.current.push(marker);
    });

    // Draw line and calculate measurements if we have 2 points
    if (rulerPoints.length === 2) {
      const ptA = L.latLng(rulerPoints[0]);
      const ptB = L.latLng(rulerPoints[1]);
      
      rulerPolylineRef.current = L.polyline(rulerPoints, {
        color: '#eab308',
        weight: 3,
        dashArray: '5, 5'
      }).addTo(map);

      // Calculations
      const dist = ptA.distanceTo(ptB); // in meters
      const lat1 = ptA.lat * Math.PI / 180;
      const lat2 = ptB.lat * Math.PI / 180;
      const dLon = (ptB.lng - ptA.lng) * Math.PI / 180;
      const y = Math.sin(dLon) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
      let brng = Math.atan2(y, x) * 180 / Math.PI;
      brng = (brng + 360) % 360; // Normalize bearing

      const flightSpeed = 15; // m/s
      const travelTime = dist / flightSpeed; // seconds

      setDistanceInfo({
        distance: parseFloat((dist / 1000).toFixed(3)), // km
        bearing: Math.round(brng),
        time: Math.round(travelTime)
      });
    }
  }, [rulerPoints]);

  // Setup Altitude Profile Chart
  useEffect(() => {
    if (!chartCanvasRef.current) return;

    const ctx = chartCanvasRef.current.getContext('2d');
    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    // Mock elevation profiles
    const labels = Array.from({ length: 20 }, (_, i) => `${(i * 100)}m`);
    const terrainHeight = [42, 43, 45, 48, 52, 55, 54, 50, 47, 43, 40, 42, 46, 51, 55, 58, 56, 51, 46, 44];
    const droneAltitude = [92, 95, 98, 100, 102, 105, 106, 104, 101, 98, 95, 93, 94, 98, 102, 105, 106, 103, 99, 96];

    if (chartInstanceRef.current) chartInstanceRef.current.destroy();

    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Drone Altitude (AGL)',
            data: droneAltitude,
            borderColor: '#0ea5e9',
            backgroundColor: 'rgba(14, 165, 233, 0.08)',
            borderWidth: 2.5,
            tension: 0.35,
            fill: true
          },
          {
            label: 'Terrain Elevation',
            data: terrainHeight,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.25)',
            borderWidth: 1.5,
            tension: 0.25,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: textColor, font: { size: 10, weight: '600' } }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 9 } }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 9 } },
            title: { display: true, text: 'Height (m)', color: textColor, font: { size: 10, weight: '600' } }
          }
        }
      }
    });

    return () => {
      if (chartInstanceRef.current) chartInstanceRef.current.destroy();
    };
  }, []);

  // Simple converter formula (mocked UTM projection conversion for speed and stability)
  const convertWgs84ToUtm = (lat, lng) => {
    // Basic approximate conversion formulas for northern hemisphere Zone 43
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) return;

    // Refined scaling factors for Kharkhoda grid area
    const northing = (3191000 + (parsedLat - 28.8350) * 110574).toFixed(1);
    const easting = (688400 + (parsedLng - 76.9330) * 96486).toFixed(1);

    setUtmResult({
      zone: '43N',
      easting,
      northing
    });
  };

  const handleConvertClick = () => {
    convertWgs84ToUtm(inputLat, inputLng);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo([parseFloat(inputLat), parseFloat(inputLng)], { animate: true });
    }
  };

  const handleUploadGeoJSON = (e) => {
    e.preventDefault();
    if (!uploadName || !uploadFile) {
      alert("Please fill name and drop a mock KML/GeoJSON file.");
      return;
    }

    const newProj = {
      id: `PROJ-00${projects.length + 1}`,
      name: uploadName,
      area: `${(0.2 + Math.random() * 0.9).toFixed(2)} sq km`,
      gsd: `${(1.5 + Math.random() * 2).toFixed(1)} cm/px`,
      sensor: 'Yuneec H850 (Multispectral)',
      date: new Date().toISOString().split('T')[0],
      status: 'Processed'
    };

    setProjects([newProj, ...projects]);
    setUploadName('');
    setUploadFile(null);
    alert(`File parsed and added as survey run: ${newProj.name}`);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 text-left">
      {/* LEFT COLUMN: Map & Interactive GIS Controls */}
      <div className="xl:col-span-8 space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col h-[520px]">
          <header className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">Geo-Spatial Map & Layer Controls</h3>
              <p className="text-[10px] text-slate-400">Click on map to read UTM projections, measure coordinates, and configure overlays.</p>
            </div>
            <div className="flex gap-2 text-xs">
              <label className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-slate-100">
                <input type="checkbox" checked={layers.ortho} onChange={(e) => setLayers(l => ({ ...l, ortho: e.target.checked }))} className="rounded text-sky-500 focus:ring-sky-400 w-3 h-3" />
                <span>Ortho</span>
              </label>
              <label className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-slate-100">
                <input type="checkbox" checked={layers.dsm} onChange={(e) => setLayers(l => ({ ...l, dsm: e.target.checked }))} className="rounded text-sky-500 focus:ring-sky-400 w-3 h-3" />
                <span>DSM</span>
              </label>
              <label className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-slate-100">
                <input type="checkbox" checked={layers.boundary} onChange={(e) => setLayers(l => ({ ...l, boundary: e.target.checked }))} className="rounded text-sky-500 focus:ring-sky-400 w-3 h-3" />
                <span>Boundary</span>
              </label>
              <label className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-slate-100">
                <input type="checkbox" checked={layers.nofly} onChange={(e) => setLayers(l => ({ ...l, nofly: e.target.checked }))} className="rounded text-sky-500 focus:ring-sky-400 w-3 h-3" />
                <span>No-Fly</span>
              </label>
            </div>
          </header>

          {/* Leaflet Container */}
          <div className="flex-1 w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 relative">
            <div ref={mapRef} className="w-full h-full z-10" />
            <div className="absolute top-3 left-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-[10px] space-y-1 z-20 pointer-events-none shadow-md">
              <div className="font-bold text-sky-500">SURVEY REGION GRID</div>
              <div>SW Boundary: [28.8310, 76.9290]</div>
              <div>NE Boundary: [28.8400, 76.9380]</div>
            </div>
            {/* Map Actions HUD */}
            <div className="absolute bottom-3 left-3 flex gap-2 z-20">
              <button 
                onClick={() => setRulerPoints([])}
                className="bg-slate-900/80 hover:bg-slate-900 text-white font-semibold text-[10px] py-1.5 px-3 rounded-lg border border-slate-800 backdrop-blur-md active:scale-95 transition-all shadow-md"
              >
                Clear Measurements
              </button>
            </div>
          </div>
        </div>

        {/* GIS Interactive Panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* UTM Projection Converter */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-3">WGS84 ⇄ UTM Coordinates Converter</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold mb-1">Latitude</label>
                  <input 
                    type="number" 
                    step="0.000001" 
                    value={inputLat}
                    onChange={(e) => setInputLat(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold mb-1">Longitude</label>
                  <input 
                    type="number" 
                    step="0.000001" 
                    value={inputLng}
                    onChange={(e) => setInputLng(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>
              <button 
                onClick={handleConvertClick}
                className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 rounded-lg text-xs transition-colors"
              >
                Project on Map & Convert UTM
              </button>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-100 dark:border-slate-800 text-xs grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[9px] text-slate-400 font-bold uppercase">UTM Zone</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-100">{utmResult.zone}</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400 font-bold uppercase">Easting (X)</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-100">{utmResult.easting} m</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400 font-bold uppercase">Northing (Y)</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-100">{utmResult.northing} m</div>
                </div>
              </div>
            </div>
          </div>

          {/* Map Ruler Panel */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-3">Survey Measurement Ruler</h4>
            <p className="text-[10px] text-slate-400 mb-3">Click any two points on the map above to calculate geographical distance and flight bearing.</p>
            
            {rulerPoints.length < 2 ? (
              <div className="h-32 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg flex flex-col justify-center items-center text-slate-400">
                <span className="material-symbols-outlined text-2xl mb-1">straighten</span>
                <span className="text-[10px]">Select Point A & B on the map</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 bg-yellow-500/5 dark:bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-xs">
                  <div>
                    <div className="text-[9px] text-slate-400 font-bold">DISTANCE</div>
                    <div className="font-bold text-yellow-600 dark:text-yellow-400 text-sm">{distanceInfo.distance} km</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-400 font-bold">BEARING</div>
                    <div className="font-bold text-yellow-600 dark:text-yellow-400 text-sm">{distanceInfo.bearing}°</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-400 font-bold">FLIGHT TIME</div>
                    <div className="font-bold text-yellow-600 dark:text-yellow-400 text-sm">{distanceInfo.time} s</div>
                  </div>
                </div>
                <div className="text-[9px] text-slate-400 space-y-1">
                  <div>• Coordinate A: [{rulerPoints[0][0].toFixed(5)}, {rulerPoints[0][1].toFixed(5)}]</div>
                  <div>• Coordinate B: [{rulerPoints[1][0].toFixed(5)}, {rulerPoints[1][1].toFixed(5)}]</div>
                  <div>• Est. Speed: 15.0 m/s (54 km/h) Cruise Velocity</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Elevation profile, surveys log, import */}
      <div className="xl:col-span-4 space-y-6">
        {/* Altitude Profile Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col h-[280px]">
          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-2">Elevation & Altitude Profile</h4>
          <div className="flex-1 min-h-0 relative">
            <canvas ref={chartCanvasRef} />
          </div>
        </div>

        {/* Survey Project Log */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-3">Processed Surveys Log</h4>
          <div className="space-y-3 max-h-[190px] overflow-y-auto scrollbar-thin">
            {projects.map((proj) => (
              <div 
                key={proj.id} 
                onClick={() => setSelectedProject(proj.id)}
                className={`p-2.5 rounded-lg border text-xs text-left cursor-pointer transition-colors ${
                  selectedProject === proj.id 
                    ? 'border-sky-500 bg-sky-50/20 dark:bg-sky-950/20' 
                    : 'border-slate-100 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-slate-800 dark:text-slate-100">{proj.name}</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">{proj.status}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-400">
                  <div>Area: <span className="font-semibold text-slate-600 dark:text-slate-200">{proj.area}</span></div>
                  <div>GSD: <span className="font-semibold text-slate-600 dark:text-slate-200">{proj.gsd}</span></div>
                  <div>Sensor: <span className="font-semibold text-slate-600 dark:text-slate-200">{proj.sensor}</span></div>
                  <div>Date: <span className="font-semibold text-slate-600 dark:text-slate-200">{proj.date}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* KML/GeoJSON Import Panel */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-2">Import KML / GeoJSON</h4>
          <form onSubmit={handleUploadGeoJSON} className="space-y-3">
            <div>
              <label className="block text-[10px] text-slate-400 font-bold mb-1">Survey Run Name</label>
              <input 
                type="text" 
                required
                placeholder="e.g. Area F Boundary survey"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 font-bold mb-1">Upload File</label>
              <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-4 text-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors relative">
                <input 
                  type="file" 
                  accept=".kml,.json,.geojson"
                  required
                  onChange={(e) => setUploadFile(e.target.files[0])}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <span className="material-symbols-outlined text-slate-400 text-lg mb-1">cloud_upload</span>
                <p className="text-[10px] text-slate-400 font-semibold">{uploadFile ? uploadFile.name : 'Select .kml, .json, or .geojson'}</p>
              </div>
            </div>
            <button 
              type="submit"
              className="w-full bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-650 text-white font-bold py-2 rounded-lg text-xs transition-colors"
            >
              Parse & Sync Spatial Layer
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default GeospatialSection;
